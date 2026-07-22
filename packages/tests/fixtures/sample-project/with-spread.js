// This file uses spread syntax inside functions (unsafe)

'use strict';

// Spread in function (unsafe)
function merge(a, b) {
	return { ...a, ...b };
}

// Array spread in function (unsafe)
function combine(arr1, arr2) {
	return [...arr1, ...arr2];
}

module.exports = { merge, combine };
