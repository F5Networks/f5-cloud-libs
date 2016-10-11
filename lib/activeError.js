function ActiveError(message) {
    this.message = message;
    this.stack = Error().stack;
}
ActiveError.prototype = Object.create(Error.prototype);
ActiveError.prototype.name = "ActiveError";

module.exports = ActiveError;