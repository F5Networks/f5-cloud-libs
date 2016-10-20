/**
 * Copyright 2016 F5 Networks, Inc.
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
 */
'use strict';

function ActiveError(message) {
    this.message = message;
    this.stack = Error().stack;
}
ActiveError.prototype = Object.create(Error.prototype);
ActiveError.prototype.name = "ActiveError";

module.exports = ActiveError;