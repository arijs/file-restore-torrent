import fs from "fs";
import path from "path";
import util from "util";

function EOFClass () {}
const EOF = new EOFClass();

run(processArgv(process.argv));

function run(opt) {
	filePathsToObjects(opt);
	return openFiles(opt, (err) => {
		if (err) {
			console.error(`Error opening file`, err);
			return finish(opt, 2);
		}
		opt.errorSegments = [];
		opt.errorBytesCount = 0;
		opt.errorCurrent = null;
		opt.commonBlocks = [];
		opt.commonBytesRead = 0;
		opt.commonCurrent = null;
		opt.fileLongest = null;
		return compare(opt, (err) => {
			if (err) {
				console.error('Error comparing files', err);
				return finish(opt, err ? 4 : 0);
			}
			logDetectionResults(opt);
			return printFixedFile(opt, (err, flStart, bread, esIndex) => {
				if (err) {
					console.error('Error printing fixed file', err);
				}
				const {fileLongest: fl} = opt;
				console.error(`Finished printing fixed file (write: ${flStart + bread}, read: ${fl.size})`);
				return finish(opt, err ? 6 : 0);
			});
		});
	});
}

function processArgv(argv) {
	var files = [];
	var base = process.cwd();
	var bufSize = 262144;//131072;//16384;
	var startIndex = 0;
	var commonBlockSize = 16;
	var aname = '';
	var c = argv.length;
	for (var i = 2; i < c; i++) {
		var av = String(argv[i]);
		if (av.charAt(0) === '-') {
			if (av === '-f' || av === '--files') {
				aname = 'f';
			} else
			if (av === '-b' || av === '--base') {
				aname = 'b';
			}
		} else
		if (aname === 'f') {
			files.push(av);
		} else
		if (aname === 'b') {
			base = av;
		}
	}
	return {
		base,
		files,
		bufSize,
		startIndex,
		commonBlockSize,
	};
}

function filePathsToObjects(opt) {
	const {files, bufSize} = opt;
	var c = files.length;
	var olist = opt.files = new Array(c);
	for (var i = 0; i < c; i++) {
		var fpath = files[i];
		olist[i] = {
			dir: path.dirname(fpath),
			file: path.basename(fpath),
			size: 0,
			fd: null,
			err: null,
			eof: false,
			bread: 0, // bytes read
			buf: Buffer.alloc(bufSize),
		};
	}
}

function openFiles(opt, cb) {
	const {base, files} = opt;
	var c = files.length;
	if (!c) {
		return cb(new Error('No file to compare!'));
	}
	for (var i = 0; i < c; i++) {
		var obj = files[i];
		if (!obj.fd) {
			return fs.open(path.resolve(base, obj.dir, obj.file), (err, fd) => {
				obj.err = err;
				obj.fd = fd;
				if (err) {
					return cb(obj);
				} else {
					return openFiles(opt, cb);
				}
			});
		}
	}
	return cb();
}

function closeFiles(opt, cb, elist = []) {
	const {files} = opt;
	var c = files.length;
	for (var i = 0; i < c; i++) {
		var obj = files[i];
		if (obj.fd)  {
			return fs.close(obj.fd, (err) => {
				obj.err = err;
				obj.fd = undefined;
				if (err) elist.push(obj);
				closeFiles(opt, cb, elist);
			});
		}
	}
	return cb(elist.length ? elist : undefined);
}

function logDetectionResults(opt) {
	console.error(`Base:`, opt.base);
	console.error(`Files:`);
	opt.files.forEach((f, i) => console.error(`[${i}] size: ${f.size}, bread: ${f.bread} - ${path.join(f.dir, f.file)}`));
	console.error(`Result: ${opt.errorSegments.length} segments and ${opt.errorBytesCount} bytes mismatched`);
	//, util.inspect(opt.errorSegments, {depth: 3, colors: true}));
	opt.errorSegments.forEach((segment, i) => {
		const s = {...segment};
		s.common = s.common.map(b => byteStr(b)).join('');
		console.error(`[${i}]`, s);
	});
	const cbl = opt.commonBlocks.length;
	const cbs = opt.commonBlockSize;
	const cbr = opt.commonBytesRead;
	console.error(`Common blocks: ${cbl}`);
	opt.commonBlocks.forEach((cb, i) => console.error(`[${i}] size: ${cbl === i + 1 ? cbr : cbs}`, cb));
}

function finish(opt, code) {
	return closeFiles(opt, (err) => {
		if (err) console.error(`Error closing files`, err);
		return process.exit(code + (err ? 1 : 0));
	});
}

function readFiles(opt, cb, fileIndex = 0, eofCount = 0) {
	const {files, bufSize, startIndex} = opt;
	if (fileIndex < files.length) {
		const obj = files[fileIndex];
		if (obj.eof) {
			return readFiles(opt, cb, fileIndex + 1, eofCount + 1);
		}
		return fs.read(obj.fd, obj.buf, 0, bufSize, startIndex * bufSize, (err, bread) => {
			obj.bread = bread;
			if (err) {
				obj.err = err;
				return cb(obj, false);
			}
			if (bread < bufSize) {
				obj.eof = true;
				obj.size = startIndex * bufSize + bread;
			}
			return readFiles(opt, cb, fileIndex + 1, eofCount + (obj.eof ? 1 : 0));
		});
	} else {
		return cb(undefined, eofCount === fileIndex);
	}
}

function insertByteValue(values, val, index) {
	const c = values.length;
	for (let i = 0; i < c; i++) {
		const obj = values[i];
		if (obj.val === val) {
			obj.count += 1;
			obj.files.push(index);
			return;
		}
	}
	values.push({ val, count: 1, files: [index] });
}

function mostCommonBytes(values) {
	let top;
	let runnerUps = [];
	const c = values.length;
	for (var i = 0; i < c; i++) {
		const v = values[i];
		if (!top || v.count > top.count) {
			top = v;
			runnerUps = [];
		} else
		if (v.count === top.count) {
			runnerUps.push(v);
		}
	}
	runnerUps.unshift(top);
	return runnerUps;
}

function byteStr(b) {
	if (b === EOF) return '--';
	return (16 > b ? '0' : '')+b.toString(16);
}

function compare(opt, cb) {
	return readFiles(opt, (err, end) => {
		if (err) {
			return cb(err);
		}
		const {files, bufSize, startIndex} = opt;
		const fcount = files.length;
		let longest;
		// let longestIndex = -1;
		let allEof = true;
		for (let i = 0; i < fcount; i++) {
			const file = files[i];
			if (!file.eof) {
				longest = file;
				// longestIndex = i;
				allEof = false;
				break;
			}
			if (!longest || file.size > longest.size) {
				longest = file;
				// longestIndex = i;
			}
		}
		opt.fileLongest = longest;
		let {
			errorCurrent,
			commonCurrent,
			commonBlockSize: cbs,
			commonBytesRead: cbr,
		} = opt;
		let bufErrorBytes = 0;
		const bread = longest.bread;
		for (let j = 0; j < bread; j++) {
			const values = [];
			for (let i = 0; i < fcount; i++) {
				const file = files[i];
				insertByteValue(values, j >= file.bread ? EOF : file.buf[j], i);
			}
			if (values.length === 1) {
				if (errorCurrent) {
					opt.errorCurrent = errorCurrent = undefined;
				}
			} else {
				if (!errorCurrent) {
					opt.errorCurrent = errorCurrent = {
						start: startIndex * bufSize + j,
						bytes: 0,
						common: [],
						top: [],
					};
					opt.errorSegments.push(errorCurrent);
				}
				if (!commonCurrent) {
					opt.commonCurrent = commonCurrent = Buffer.alloc(cbs);
					opt.commonBlocks.push(commonCurrent);
					// opt.commonBytesRead = 0; // não é necessário
				}
				const mcb = mostCommonBytes(values);
				const mcbByte = mcb[0].val;
				errorCurrent.bytes += 1;
				errorCurrent.common.push(mcbByte);
				errorCurrent.top.push([mcb[0].files.join(), mcb[0].count].concat(
					mostCommonBytes(values).map(v => byteStr(v.val))
				));
				commonCurrent[cbr] = mcbByte;
				cbr += 1;
				if (cbr === cbs) {
					opt.commonBytesRead = cbr = 0;
					opt.commonCurrent = commonCurrent = null;
				} else {
					opt.commonBytesRead = cbr;
				}
				opt.errorBytesCount += 1;
				bufErrorBytes += 1;
			}
			// values = mostCommonBytes(values); 0 3 2 4 1
		}
		if (allEof !== end) {
			console.error(`readFile (${typeof end}) and compare (${typeof allEof}) functions disagree wether all files have ended`);
		}
		console.error(`Read index ${opt.startIndex}${bufErrorBytes?` - ${bufErrorBytes} mismatched bytes`:``}`);
		if (allEof || end) {
			return cb();
		} else {
			opt.startIndex += 1;
			return compare(opt, cb);
		}
	});
}

function printFixedBlock(opt, printIndex, esIndex, bstart, bread, cb) {
	const {fileLongest: fl, bufSize, errorSegments} = opt;
	let flStart = printIndex * bufSize + bstart;
	let numBytes = 0;
	let esCommonStart = 0;
	let printBuf = null;
	const flEnd = flStart - bstart + bread;
	const esc = errorSegments.length;
	if (esIndex === esc) {
		numBytes = bread - bstart;
		printBuf = fl.buf.slice(bstart, bstart + numBytes);
		// console.error(`[${printIndex} + ${bstart}][${esIndex}] print ${printBuf.length}/${numBytes} last error passed (${esIndex}/${esc})`);
		process.stdout.write(printBuf);
		return cb(esIndex);
	}
	const es = errorSegments[esIndex];
	const esStart = es ? es.start : Infinity;
	const esEnd = es ? esStart + es.bytes : Infinity;
	if (esStart >= flEnd) {
		numBytes = bread - bstart;
		printBuf = fl.buf.slice(bstart, bstart + numBytes);
		// console.error(`[${printIndex} + ${bstart}][${esIndex}] print ${printBuf.length}/${numBytes} next error (${esStart}) is after this block (${flEnd})`);
		process.stdout.write(printBuf);
		return cb(esIndex);
	} else {
		if (esStart > flStart) {
			numBytes = esStart - flStart;
			printBuf = fl.buf.slice(0, numBytes);
			console.error(`[${printIndex} + ${bstart}][${esIndex}] print ${printBuf.length}/${numBytes} bytes from block before error at ${esStart} = ${flStart + numBytes}`);
			process.stdout.write(printBuf);
			bstart += numBytes;
			flStart += numBytes;
		}
		if (esEnd <= flStart) {
			console.error(`[${printIndex} + ${bstart}][${esIndex}] go to next error, current error (${esEnd}) has finished before current position (${flStart}, should not happen)`);
			return printFixedBlock(opt, printIndex, esIndex + 1, bstart, bread, cb);
		}
		if (esEnd <= flEnd) {
			// if (esStart === flStart) {
			// 	numBytes = es.common.length;
			// 	process.stdout.write(Buffer.from(es.common));
			// 	bstart += numBytes;
			// 	flStart += numBytes;
			// } else {
			esCommonStart = flStart - esStart;
			numBytes = es.common.length - esCommonStart;
			printBuf = Buffer.from(es.common.slice(esCommonStart, esCommonStart + numBytes));
			console.error(`[${printIndex} + ${bstart}][${esIndex}] print ${printBuf.length}/${numBytes} bytes from current error from position ${esCommonStart} (file at ${flStart} = error at ${esStart + esCommonStart}) until end of error (${esEnd})`);
			process.stdout.write(printBuf);
			bstart += numBytes;
			flStart += numBytes;
			// }
			if (esEnd === flEnd) {
				console.error(`[${printIndex} + ${bstart}][${esIndex}] current error (${esEnd}) ends exactly the same position as current block (${flEnd}), go to next error`);
				return cb(esIndex + 1);
			}
			console.error(`[${printIndex} + ${bstart}][${esIndex}] finished current error (${esEnd}), go to next error from ${flStart}`);
			return printFixedBlock(opt, printIndex, esIndex + 1, bstart, bread, cb);
		} else {
			esCommonStart = flStart - esStart;
			numBytes = es.common.length - esCommonStart - (esEnd - flEnd);
			printBuf = Buffer.from(es.common.slice(esCommonStart, esCommonStart + numBytes));
			console.error(`[${printIndex} + ${bstart}][${esIndex}] print ${printBuf.length}/${numBytes} bytes from current error from position ${esCommonStart} (file at ${flStart} = error at ${esStart + esCommonStart}) until end of block (${flEnd} = ${esStart - esCommonStart + numBytes}), then go to next block`);
			process.stdout.write(printBuf);
			return cb(esIndex);
		}
	}
}

function printFixedFile(opt, cb, printIndex = 0, esIndex = 0) {
	const {fileLongest: fl, bufSize} = opt;
	const flStart = printIndex * bufSize;
	return fs.read(fl.fd, fl.buf, 0, bufSize, flStart, (err, bread) => {
		if (err) return cb(err, flStart, bread, esIndex);
		return printFixedBlock(opt, printIndex, esIndex, 0, bread, esIndex => {
			let fileShouldEnd = fl.size <= flStart + bread;
			let fileActuallyEnded = bread < bufSize;
			if (fileActuallyEnded !== fileShouldEnd) {
				console.error(`fs.read bytes (${flStart + bread}) disagree from expected file size (${fl.size}) whether the file has ended reading`, path.join(fl.dir, fl.file));
			}
			if (fileActuallyEnded) {
				return cb(undefined, flStart, bread, esIndex);
			} else {
				return printFixedFile(opt, cb, printIndex+1, esIndex);
			}
		});
	});
}
