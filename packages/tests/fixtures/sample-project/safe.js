// This file contains SAFE primordial usage (module-level caching)

'use strict';

// Safe: caching at module level
const $push = Array.prototype.push;
const $keys = Object.keys;
const $map = Array.prototype.map;

// Safe: passing to a function at module level (like call-bind)
function bind(fn) {
	return fn.bind(null);
}
const boundPush = bind(Array.prototype.push);

// Safe: storing in an object at module level
const cached = {
	push: Array.prototype.push,
	pop: Array.prototype.pop,
};

// Using cached values is fine
function doStuff(arr, item) {
	$push.call(arr, item);
	return $keys({ a: 1 });
}

module.exports = { doStuff, cached, boundPush };
