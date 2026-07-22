// This file contains UNSAFE primordial usage (runtime access)

'use strict';

// Unsafe: runtime access to instance method
function addItem(arr, item) {
	arr.push(item);
}

// Unsafe: runtime access to prototype
function getMethod() {
	return Array.prototype.push;
}

// Unsafe: literal array still uses primordial
function createArray() {
	return [1, 2, 3].map(function (x) { return x * 2; });
}

// Unsafe: static method access at runtime
function getKeys(obj) {
	return Object.keys(obj);
}

// Unsafe: global usage at runtime
function makeArray() {
	return new Array(5);
}

// Unsafe: string methods
function processString(str) {
	return str.slice(0, 5).toUpperCase();
}

module.exports = { addItem, getMethod, createArray, getKeys, makeArray, processString };
