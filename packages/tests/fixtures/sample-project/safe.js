// This file contains SAFE primordial usage (module-level caching)

'use strict';

// Safe: caching at module level
const $push = Array.prototype.push;
const $keys = Object.keys;
const $map = Array.prototype.map;

// Safe: binding at module level, so no call site has to reach for `.call` at runtime
const $call = Function.prototype.call;
const pushOne = $call.bind($push);

// Safe: storing in an object at module level
const cached = {
	push: Array.prototype.push,
	pop: Array.prototype.pop,
};

// Safe: calling a bound primordial is a call, not a reach for `.call`
function doStuff(arr, item) {
	pushOne(arr, item);
	return $keys({ a: 1 });
}

module.exports = { $map, cached, doStuff, pushOne };
