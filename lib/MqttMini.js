// MqttMini.js
// Subscribe-only MQTT 3.1.1 client using mqtt-packet (QoS 0).
// Provides awaitable "sync-like" lifecycle: await connect(), await close().
// Optional auto-reconnect after unexpected disconnect with exponential backoff.
// Supports dynamic password (e.g. OAuth bearer token) via opts.getPassword().
// npm i mqtt-packet
const net = require("net");
const tls = require("tls");
const mqtt = require("mqtt-packet");

class MqttMini {
  /**
   * @param {object} opts
   * @param {string} opts.host
   * @param {number} opts.port               // 1883 or 8883
   * @param {boolean} [opts.tls=false]
   * @param {object} [opts.tlsOptions={}]
   * @param {string} opts.topic
   * @param {string} [opts.clientId]
   * @param {string} [opts.username]
   * @param {string} [opts.password]         // optional static password / token
   * @param {() => (string|undefined|Promise<string|undefined>)} [opts.getPassword]
   *        // optional callback for dynamic password (e.g. refreshed OAuth token)
   * @param {number} [opts.keepalive=60] seconds
   * @param {boolean} [opts.clean=true]
   * @param {number} [opts.pingRespGraceMs=10000]
   * @param {boolean} [opts.reconnect=true]
   * @param {number} [opts.reconnectMs=1000]
   */
  constructor(opts) {
    this.opts = {
      tls: false,
      tlsOptions: {},
      keepalive: 60, // default 60s
      clean: true,
      pingRespGraceMs: 10000, // 10s grace for ping response
      reconnect: true,
      reconnectMs: 10000, // base reconnect delay
      ...opts,
    };

    if (!this.opts.host) throw new Error("host is required");
    if (!this.opts.port) throw new Error("port is required (1883 or 8883)");
    if (!this.opts.topic) throw new Error("topic is required");

    this.clientId =
      this.opts.clientId || `subonly_${Math.random().toString(16).slice(2)}`;

    this._sock = null;
    this._parser = mqtt.parser();

    this._pingTimer = null;
    this._watchdogTimer = null;
    this._pingRespDeadline = null;

    this._onMessage = () => {};
    this._onStatus = () => {};

    // lifecycle
    this._state = "idle"; // idle | connecting | ready | closing
    this._closedByUser = false;

    // connect promise hooks
    this._connectResolve = null;
    this._connectReject = null;
    this._connectTimeout = null;
    this._connectPromise = null;

    // close promise hooks
    this._closeResolve = null;
    this._closeTimeout = null;
    this._closePromise = null;

    // reconnect guard & backoff
    this._reconnectTimer = null;
    this._reconnectAttempt = 0; // used for exponential backoff

    this._parser.on("packet", (pkt) => this._handlePacket(pkt));
  }

  onMessage(fn) {
    this._onMessage = typeof fn === "function" ? fn : () => {};
    return this;
  }

  onStatus(fn) {
    this._onStatus = typeof fn === "function" ? fn : () => {};
    return this;
  }

  get state() {
    return this._state;
  }

  /**
   * Awaitable connect: resolves when connected + subscribed (SUBACK ok).
   * Rejects on error or timeout.
   */
  async connect(timeoutMs = 10000) {
    if (this._state === "ready") return;
    if (this._state !== "idle") throw new Error(`Invalid state: ${this._state}`);

    this._closedByUser = false;
    this._state = "connecting";

    this._connectPromise = new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;

      this._connectTimeout = setTimeout(() => {
        this._failConnect(new Error("MQTT connect timeout"));
      }, timeoutMs);
      this._connectTimeout.unref?.();
    });

    // reset reconnect attempts on deliberate connect
    this._reconnectAttempt = 0;

    this._openSocket();
    this._startWatchdog();

    return this._connectPromise;
  }

  /**
   * Awaitable close: resolves when socket is closed and timers are stopped.
   * Idempotent.
   */
  async close(timeoutMs = 3000) {
    if (this._closePromise) return this._closePromise;
    if (this._state === "idle") return;

    const wasConnecting = this._state === "connecting";

    this._closedByUser = true;
    this._state = "closing";

    // Cancel any pending reconnect attempt
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._closePromise = new Promise((resolve) => {
      this._closeResolve = resolve;

      // If connect in progress, reject it
      if (wasConnecting) {
        this._failConnect(new Error("Closed during connect"));
      }

      this._stopKeepalive();
      this._stopWatchdog();

      if (!this._sock) {
        this._finalizeClose();
        return;
      }

      const sock = this._sock;
      const done = () => this._finalizeClose();

      sock.once("close", done);
      sock.once("error", done);

      // Force shutdown
      sock.end();
      sock.destroy();

      // Safety fallback
      this._closeTimeout = setTimeout(done, timeoutMs);
      this._closeTimeout.unref?.();
    });

    return this._closePromise;
  }

  /**
   * True when MQTT session is usable (connected + subscribed).
   */
  isReady() {
    return this._state === "ready";
  }

  /**
   * True when the underlying socket is currently connected.
   */
  isSocketConnected() {
    const s = this._sock;
    if (!s) return false;
    if (s.destroyed) return false;
    if (typeof s.connecting === "boolean" && s.connecting) return false;
    if (typeof s.readyState === "string" && s.readyState !== "open") return false;
    return true;
  }

  /**
   * Combined view (handy for logging/health checks).
   */
  getStatus() {
    return {
      state: this._state,
      mqttReady: this.isReady(),
      socketConnected: this.isSocketConnected(),
      socketDestroyed: !!this._sock?.destroyed,
      socketReadyState: this._sock?.readyState,
      reconnectAttempt: this._reconnectAttempt,
      reconnectScheduled: !!this._reconnectTimer,
    };
  }

  // ---- internals ----

  _emitStatus(status, extra) {
    try {
      this._onStatus(status, extra);
    } catch (_) {}
  }

  _send(buf) {
    if (this._sock && this._sock.writable) this._sock.write(buf);
  }

  _finalizeClose() {
    if (this._closeTimeout) clearTimeout(this._closeTimeout);
    this._closeTimeout = null;

    if (this._sock) {
      this._sock.removeAllListeners();
      this._sock = null;
    }

    // Clear any pending connect hooks (defensive)
    if (this._connectTimeout) clearTimeout(this._connectTimeout);
    this._connectTimeout = null;
    this._connectResolve = this._connectReject = null;
    this._connectPromise = null;

    // Cancel any pending reconnect attempt
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempt = 0;

    this._state = "idle";

    const r = this._closeResolve;
    this._closeResolve = null;
    this._closePromise = null;

    this._emitStatus("closed");
    r?.();
  }

  _settleConnectSuccess() {
    if (this._state !== "connecting") return;

    if (this._connectTimeout) clearTimeout(this._connectTimeout);
    this._connectTimeout = null;

    this._state = "ready";

    // reset reconnect attempts after a successful connect
    this._reconnectAttempt = 0;

    const r = this._connectResolve;
    this._connectResolve = this._connectReject = null;
    this._connectPromise = null;

    this._emitStatus("ready");
    r?.();
  }

  _failConnect(err) {
    if (this._state !== "connecting") return;

    if (this._connectTimeout) clearTimeout(this._connectTimeout);
    this._connectTimeout = null;

    const rej = this._connectReject;
    this._connectResolve = this._connectReject = null;
    this._connectPromise = null;

    // Tear down socket
    this._stopKeepalive();
    try {
      this._sock?.destroy();
    } catch (_) {}
    this._sock = null;

    this._state = "idle";

    this._emitStatus("error", err);
    rej?.(err);
  }

  _scheduleReconnect() {
    if (!this.opts.reconnect) return;
    if (this._closedByUser) return;
    if (this._state === "closing") return;
    if (this._reconnectTimer) return;

    this._reconnectAttempt += 1;
    const attempt = this._reconnectAttempt;
    const base = Math.max(10, this.opts.reconnectMs); // minimal sensible base
    const delay = Math.min(30000, base * Math.pow(2, attempt - 1)); // cap 30s

    this._emitStatus("reconnect_scheduled", delay);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._closedByUser || this._state === "closing") return;

      this._state = "connecting";
      this._openSocket();
      this._startWatchdog();
    }, delay);

    this._reconnectTimer.unref?.();
  }

  /**
   * Resolve current password:
   * - if opts.getPassword is provided, use it (sync or async)
   * - otherwise use opts.password
   */
  async _resolvePassword() {
    const { password, getPassword } = this.opts;

    if (typeof getPassword !== "function") {
      return password;
    }

    try {
      const res = getPassword();
      if (res && typeof res.then === "function") {
        return await res;
      }
      return res;
    } catch (err) {
      this._emitStatus("error", err);
      // fallback to static password if callback fails
      return password;
    }
  }

  _openSocket() {
    const { host, port, tls: useTls, tlsOptions } = this.opts;

    this._sock = useTls
      ? tls.connect({ host, port, ...(tlsOptions || {}) })
      : net.createConnection({ host, port });

    // enable TCP keepalive (OS-level) to help detect dead peers
    try {
      if (typeof this._sock.setKeepAlive === "function") {
        this._sock.setKeepAlive(true, Math.max(1000, this.opts.keepalive * 1000));
      }
    } catch (_) {
      // ignore non-fatal failures
    }

    const readyEvent = useTls ? "secureConnect" : "connect";

    this._sock.on(readyEvent, async () => {
      this._emitStatus("socket_connected");

      // Retrieve password (supports dynamic token refresh)
      const password = await this._resolvePassword();

      // If user closed while we were resolving password, bail out quietly
      if (this._closedByUser || this._state === "closing") return;

      // CONNECT (MQTT 3.1.1)
      this._send(
        mqtt.generate({
          cmd: "connect",
          protocolId: "MQTT",
          protocolVersion: 4,
          clean: this.opts.clean,
          clientId: this.clientId,
          keepalive: this.opts.keepalive,
          username: this.opts.username,
          password, // may be undefined if not needed
        })
      );

      this._startKeepalive();
    });

    this._sock.on("data", (buf) => this._parser.parse(buf));

    this._sock.on("error", (err) => {
      this._emitStatus("error", err);
      if (this._state === "connecting") this._failConnect(err);
      // If ready: we'll likely see 'close' next and reconnect will happen there.
    });

    this._sock.on("close", () => {
      this._stopKeepalive();
      this._emitStatus("disconnected");

      if (this._state === "connecting") {
        this._failConnect(new Error("Socket closed during connect"));
        return;
      }

      if (this._state === "closing") {
        // close() will finalize via its own handlers/fallback
        return;
      }

      // Unexpected close while ready -> schedule reconnect (if enabled)
      this._state = "idle";
      this._scheduleReconnect();
    });
  }

  _handlePacket(pkt) {
    switch (pkt.cmd) {
      case "connack": {
        if (pkt.returnCode !== 0) {
          const err = new Error(`CONNACK returnCode=${pkt.returnCode}`);
          if (this._state === "connecting") this._failConnect(err);
          else this._emitStatus("error", err);
          return;
        }

        this._emitStatus("connected");

        // SUBSCRIBE QoS 0 (single topic)
        this._send(
          mqtt.generate({
            cmd: "subscribe",
            messageId: 1,
            subscriptions: [{ topic: this.opts.topic, qos: 0 }],
          })
        );
        break;
      }

      case "suback": {
        this._emitStatus("subscribed", pkt.granted);

        // SUBACK granted QoS for each topic or 0x80 for failure
        const granted = pkt.granted?.[0];
        if (granted == null || granted === 0x80) {
          const err = new Error("SUBACK denied");
          if (this._state === "connecting") this._failConnect(err);
          else this._emitStatus("error", err);
          return;
        }

        this._settleConnectSuccess();
        break;
      }

      case "publish":
        try {
          const convertedValue = this._mqttValue(pkt.payload);
          this._onMessage(pkt.topic, convertedValue);
        } catch (_) {}
        break;

      case "pingresp":
        this._pingRespDeadline = null;
        break;

      default:
        break;
    }
  }

  _startKeepalive() {
    this._stopKeepalive();

    const ka = this.opts.keepalive;
    if (!ka || ka <= 0) return;

    this._pingTimer = setInterval(() => {
      this._send(mqtt.generate({ cmd: "pingreq" }));
      this._pingRespDeadline = Date.now() + Math.max(1000, this.opts.pingRespGraceMs);
    }, ka * 1000);

    this._pingTimer.unref?.();
  }

  _stopKeepalive() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = null;
    this._pingRespDeadline = null;
  }

  _startWatchdog() {
    this._stopWatchdog();
    // less aggressive checks now that grace is larger
    this._watchdogTimer = setInterval(() => {
      if (this._pingRespDeadline && Date.now() > this._pingRespDeadline) {
        const err = new Error("PINGRESP timeout");
        this._emitStatus("error", err);

        if (this._state === "connecting") {
          this._failConnect(err);
        } else {
          // while ready: drop the socket; 'close' will schedule reconnect
          try {
            this._sock?.destroy();
          } catch (_) {}
        }
      }
    }, 1000); // check every 1s

    this._watchdogTimer.unref?.();
  }

  _stopWatchdog() {
    if (this._watchdogTimer) clearInterval(this._watchdogTimer);
    this._watchdogTimer = null;
  }

  /**
   * Convert MQTT payload Buffer to:
   * - null
   * - boolean
   * - number
   * - JSON (object/array)
   * - string (strips surrounding quotes/apostrophes)
   */
  _mqttValue(payload) {
    const s0 = Buffer.isBuffer(payload)
      ? payload.toString("utf8").trim()
      : String(payload).trim();

    if (s0 === "" || s0 == null || s0 === "null" || s0 === "NULL") return null;

    // Remove surrounding quotes/apostrophes if present
    let s = s0;
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      s = s.slice(1, -1).trim();
      if (s === "" || s === "null" || s === "NULL") return null;
    }

    // JSON object or array
    const c = s[0];
    if ((c === "{" && s.at(-1) === "}") || (c === "[" && s.at(-1) === "]")) {
      try {
        return JSON.parse(s);
      } catch (_) {}
    }

    // Boolean
    if (s === "true" || s === "TRUE") return true;
    if (s === "false" || s === "FALSE") return false;

    // Number
    if (!Number.isNaN(Number(s))) return Number(s);

    // String
    return s;
  }
}

module.exports = MqttMini;





// // MqttMini.js
// // Subscribe-only MQTT 3.1.1 client using mqtt-packet (QoS 0).
// // Provides awaitable "sync-like" lifecycle: await connect(), await close().
// // npm i mqtt-packet
// const net = require("net");
// const tls = require("tls");
// const mqtt = require("mqtt-packet");

// class MqttMini {
//   /**
//    * @param {object} opts
//    * @param {string} opts.host
//    * @param {number} opts.port               // 1883 or 8883
//    * @param {boolean} [opts.tls=false]
//    * @param {object} [opts.tlsOptions={}]
//    * @param {string} opts.topic
//    * @param {string} [opts.clientId]
//    * @param {string} [opts.username]
//    * @param {string} [opts.password]
//    * @param {number} [opts.keepalive=30] seconds
//    * @param {boolean} [opts.clean=true]
//    * @param {number} [opts.pingRespGraceMs=5000]
//    */
//   constructor(opts) {
//     this.opts = {
//       tls: false,
//       tlsOptions: {},
//       keepalive: 30,
//       clean: true,
//       pingRespGraceMs: 5000,
//       reconnect: true,
//       reconnectMs: 10000,
//       ...opts,
//     };

//     if (!this.opts.host) throw new Error("host is required");
//     if (!this.opts.port) throw new Error("port is required (1883 or 8883)");
//     if (!this.opts.topic) throw new Error("topic is required");

//     this.clientId =
//       this.opts.clientId || `subonly_${Math.random().toString(16).slice(2)}`;

//     this._sock = null;
//     this._parser = mqtt.parser();

//     this._pingTimer = null;
//     this._watchdogTimer = null;
//     this._pingRespDeadline = null;

//     this._onMessage = () => {};
//     this._onStatus = () => {};

//     // lifecycle
//     this._state = "idle"; // idle | connecting | ready | closing
//     this._closedByUser = false;

//     // connect promise hooks
//     this._connectResolve = null;
//     this._connectReject = null;
//     this._connectTimeout = null;
//     this._connectPromise = null;

//     // close promise hooks
//     this._closeResolve = null;
//     this._closeTimeout = null;
//     this._closePromise = null;

//     this._parser.on("packet", (pkt) => this._handlePacket(pkt));
//   }

//   onMessage(fn) {
//     this._onMessage = typeof fn === "function" ? fn : () => {};
//     return this;
//   }

//   onStatus(fn) {
//     this._onStatus = typeof fn === "function" ? fn : () => {};
//     return this;
//   }

//   get state() {
//     return this._state;
//   }

//   /**
//    * Awaitable connect: resolves when connected + subscribed (SUBACK ok).
//    * Rejects on error or timeout.
//    */
//   async connect(timeoutMs = 10000) {
//     if (this._state === "ready") return;
//     if (this._state !== "idle") throw new Error(`Invalid state: ${this._state}`);

//     this._closedByUser = false;
//     this._state = "connecting";

//     this._connectPromise = new Promise((resolve, reject) => {
//       this._connectResolve = resolve;
//       this._connectReject = reject;

//       this._connectTimeout = setTimeout(() => {
//         this._failConnect(new Error("MQTT connect timeout"));
//       }, timeoutMs);
//       this._connectTimeout.unref?.();
//     });

//     this._openSocket();
//     this._startWatchdog();

//     return this._connectPromise;
//   }

//   /**
//    * Awaitable close: resolves when socket is closed and timers are stopped.
//    * Idempotent.
//    */
//   async close(timeoutMs = 1000) {
//     if (this._closePromise) return this._closePromise;
//     if (this._state === "idle") return;

//     this._closedByUser = true;
//     this._state = "closing";

//     this._closePromise = new Promise((resolve) => {
//       this._closeResolve = resolve;

//       // If connect in progress, reject it
//       if (this._state === "connecting") {
//         this._failConnect(new Error("Closed during connect"));
//       }

//       this._stopKeepalive();
//       this._stopWatchdog();

//       if (!this._sock) {
//         this._finalizeClose();
//         return;
//       }

//       const sock = this._sock;
//       const done = () => this._finalizeClose();

//       sock.once("close", done);
//       sock.once("error", done);

//       // Force shutdown
//       sock.end();
//       sock.destroy();

//       // Safety fallback
//       this._closeTimeout = setTimeout(done, timeoutMs);
//       this._closeTimeout.unref?.();
//     });

//     return this._closePromise;
//   }

//     /**
//    * True when MQTT session is usable (connected + subscribed).
//    */
//   isReady() {
//     return this._state === "ready";
//   }

//   /**
//    * True when the underlying socket is currently connected.
//    * (For TLS, secure handshake is already done before CONNECT is sent.)
//    */
//   isSocketConnected() {
//     const s = this._sock;
//     if (!s) return false;
//     // net.Socket and tls.TLSSocket both have "destroyed"
//     if (s.destroyed) return false;

//     // net.Socket: "connecting" false means connection established
//     if (typeof s.connecting === "boolean" && s.connecting) return false;

//     // net.Socket: readyState often "open" when connected
//     if (typeof s.readyState === "string" && s.readyState !== "open") {
//       // sometimes it's "readOnly"/"writeOnly" in edge cases; treat as not fully open
//       return false;
//     }

//     return true;
//   }

//   /**
//    * Combined view (handy for logging/health checks).
//    */
//   getStatus() {
//     return {
//       state: this._state,                 // idle | connecting | ready | closing
//       mqttReady: this.isReady(),
//       socketConnected: this.isSocketConnected(),
//       socketDestroyed: !!this._sock?.destroyed,
//       socketReadyState: this._sock?.readyState,
//     };
//   }

//   // ---- internals ----

//   _emitStatus(status, extra) {
//     try {
//       this._onStatus(status, extra);
//     } catch (_) {}
//   }

//   _send(buf) {
//     if (this._sock && this._sock.writable) this._sock.write(buf);
//   }

//   _finalizeClose() {
//     if (this._closeTimeout) clearTimeout(this._closeTimeout);
//     this._closeTimeout = null;

//     if (this._sock) {
//       this._sock.removeAllListeners();
//       this._sock = null;
//     }

//     // Clear any pending connect hooks (defensive)
//     if (this._connectTimeout) clearTimeout(this._connectTimeout);
//     this._connectTimeout = null;
//     this._connectResolve = this._connectReject = null;
//     this._connectPromise = null;

//     this._state = "idle";

//     const r = this._closeResolve;
//     this._closeResolve = null;
//     this._closePromise = null;

//     this._emitStatus("closed");
//     r?.();
//   }

//   _settleConnectSuccess() {
//     if (this._state !== "connecting") return;

//     if (this._connectTimeout) clearTimeout(this._connectTimeout);
//     this._connectTimeout = null;

//     this._state = "ready";

//     const r = this._connectResolve;
//     this._connectResolve = this._connectReject = null;
//     this._connectPromise = null;

//     this._emitStatus("ready");
//     r?.();
//   }

//   _failConnect(err) {
//     if (this._state !== "connecting") return;

//     if (this._connectTimeout) clearTimeout(this._connectTimeout);
//     this._connectTimeout = null;

//     const rej = this._connectReject;
//     this._connectResolve = this._connectReject = null;
//     this._connectPromise = null;

//     // Tear down socket
//     this._stopKeepalive();
//     this._sock?.destroy();
//     this._sock = null;

//     this._state = "idle";

//     this._emitStatus("error", err);
//     rej?.(err);
//   }

//   _openSocket() {
//     const { host, port, tls: useTls, tlsOptions } = this.opts;

//     this._sock = useTls
//       ? tls.connect({ host, port, ...(tlsOptions || {}) })
//       : net.createConnection({ host, port });

//     const readyEvent = useTls ? "secureConnect" : "connect";
//     this._sock.on(readyEvent, () => {
//       this._emitStatus("socket_connected");

//       // CONNECT (MQTT 3.1.1)
//       this._send(
//         mqtt.generate({
//           cmd: "connect",
//           protocolId: "MQTT",
//           protocolVersion: 4,
//           clean: this.opts.clean,
//           clientId: this.clientId,
//           keepalive: this.opts.keepalive,
//           username: this.opts.username,
//           password: this.opts.password,
//         })
//       );

//       this._startKeepalive();
//     });

//     this._sock.on("data", (buf) => this._parser.parse(buf));

//     this._sock.on("error", (err) => {
//       this._emitStatus("error", err);
//       if (this._state === "connecting") this._failConnect(err);
//       // If ready, user can decide what to do; we don't auto-reconnect in this variant.
//     });

//     this._sock.on("close", () => {
//     this._stopKeepalive();
//     this._emitStatus("disconnected");

//     // If connect() is pending, fail it
//     if (this._state === "connecting") {
//         this._failConnect(new Error("Socket closed during connect"));
//         return;
//     }

//     // If user requested close(), do not reconnect
//     if (this._state === "closing" || this._closedByUser) {
//         return;
//     }

//     // Unexpected close after being ready -> reconnect (if enabled)
//     if (this.opts.reconnect) {
//         this._state = "idle"; // or "connecting" if you prefer
//         setTimeout(() => {
//         if (!this._closedByUser && this._state !== "closing") {
//             this._state = "connecting";
//             this._openSocket();
//             this._startWatchdog();
//         }
//         }, this.opts.reconnectMs).unref?.();
//     } else {
//         this._state = "idle";
//     }
//     });
//   }

//   _handlePacket(pkt) {
//     switch (pkt.cmd) {
//       case "connack": {
//         if (pkt.returnCode !== 0) {
//           const err = new Error(`CONNACK returnCode=${pkt.returnCode}`);
//           if (this._state === "connecting") this._failConnect(err);
//           else this._emitStatus("error", err);
//           return;
//         }

//         this._emitStatus("connected");

//         // SUBSCRIBE QoS 0 (single topic)
//         this._send(
//           mqtt.generate({
//             cmd: "subscribe",
//             messageId: 1,
//             subscriptions: [{ topic: this.opts.topic, qos: 0 }],
//           })
//         );
//         break;
//       }

//       case "suback": {
//         this._emitStatus("subscribed", pkt.granted);

//         // SUBACK granted QoS for each topic or 0x80 for failure
//         const granted = pkt.granted?.[0];
//         if (granted == null || granted === 0x80) {
//           const err = new Error("SUBACK denied");
//           if (this._state === "connecting") this._failConnect(err);
//           else this._emitStatus("error", err);
//           return;
//         }

//         this._settleConnectSuccess();
//         break;
//       }

//       case "publish":
//         try {
//           const convertedValue = this._mqttValue(pkt.payload);
//           this._onMessage(pkt.topic, convertedValue);
//         //   this._onMessage(pkt.topic, pkt.payload);
//         } catch (_) {}
//         break;

//       case "pingresp":
//         this._pingRespDeadline = null;
//         break;

//       default:
//         break;
//     }
//   }

//   _startKeepalive() {
//     this._stopKeepalive();

//     const ka = this.opts.keepalive;
//     if (!ka || ka <= 0) return;

//     this._pingTimer = setInterval(() => {
//       this._send(mqtt.generate({ cmd: "pingreq" }));
//       this._pingRespDeadline = Date.now() + Math.max(1000, this.opts.pingRespGraceMs);
//     }, ka * 1000);

//     this._pingTimer.unref?.();
//   }

//   _stopKeepalive() {
//     if (this._pingTimer) clearInterval(this._pingTimer);
//     this._pingTimer = null;
//     this._pingRespDeadline = null;
//   }

//   _startWatchdog() {
//     this._stopWatchdog();
//     this._watchdogTimer = setInterval(() => {
//       if (this._pingRespDeadline && Date.now() > this._pingRespDeadline) {
//         const err = new Error("PINGRESP timeout");
//         this._emitStatus("error", err);

//         if (this._state === "connecting") {
//           this._failConnect(err);
//         } else {
//           // while ready: drop the socket; user can choose to reconnect manually
//           this._sock?.destroy();
//         }
//       }
//     }, 250);

//     this._watchdogTimer.unref?.();
//   }

//   _stopWatchdog() {
//     if (this._watchdogTimer) clearInterval(this._watchdogTimer);
//     this._watchdogTimer = null;
//   }

//     /**
//      * Convert MQTT payload Buffer to:
//      * - null
//      * - number
//      * - JSON (object/array)
//      * - string
//      *
//      * @param {Buffer|Uint8Array|string|null|undefined} payload
//      * @returns {null|number|object|array|string}
//      */
//     _mqttValue(payload) {

//         const s0 = Buffer.isBuffer(payload)
//             ? payload.toString("utf8").trim()
//             : String(payload).trim();

//         if (
//             s0 === "" ||
//             s0 === null ||
//             s0 === "null" ||
//             s0 === "NULL" ||
//             s0 === undefined

//         ) return null;

//         // Remove surrounding quotes/apostrophes if present
//         let s = s0;
//         const first = s[0];
//         const last = s[s.length - 1];
//         if (
//             (first === "'" && last === "'") ||
//             (first === '"' && last === '"')
//         ) {
//             s = s.slice(1, -1).trim();
//             if (s === "") return null;
//         }

//         // JSON object or array
//         const c = s[0];
//         if (
//             (c === "{" && s.at(-1) === "}") ||
//             (c === "[" && s.at(-1) === "]")
//         ) {
//             try {
//             return JSON.parse(s);
//             } catch (_) {}
//         }

//         // Boolean (explicit, no guessing)
//         if (s === "true" || s === "TRUE") return true;
//         if (s === "false" || s === "FALSE") return false;

//         // Number
//         if (!Number.isNaN(Number(s))) {
//             return Number(s);
//         }

//         // String
//         return s;
//     }


// }

// module.exports = MqttMini;
