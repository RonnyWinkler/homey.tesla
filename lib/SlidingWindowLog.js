const CAPACITY = 60;        // Allowed amound of API calls for the window
const WINDOW_SIZE = 600;     // Window size in seconds

module.exports = class SlidingWindowLog {

  constructor(capacity = CAPACITY) {
    this.cache = [];
    this.capacity = capacity;
  }

  add() {
    this.cache.push(new Date());
    this.refresh();
    if (this.cache.length > this.capacity) {
      throw new Error('Rate limit exceeded');
    }
    return true;
  }

  refresh() {
    let windowStart = new Date(Date.now() - WINDOW_SIZE * 1000);
    this.cache = this.cache.filter((timestamp) => timestamp > windowStart);
  }

  getState(){
    return Math.round( this.cache.length * 100 / this.capacity );
  }
}