'use strict';

function collect(rows, row) {
	return rows.concat(row).join(',');
}

module.exports = collect;
