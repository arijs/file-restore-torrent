import fs from "fs";
import path from "path";

export function filePathsToObjects(files, bufSize) {
	var c = files.length;
	var olist = new Array(c);
	for (var i = 0; i < c; i++) {
		var fpath = files[i];
		olist[i] = {
			dir: path.dirname(fpath),
			file: path.basename(fpath),
			err: null,
			fd: null,
			pos: 0,
			buf: Buffer.alloc(bufSize),
			bread: 0, // bytes read
			eof: false,
			size: 0,
		};
	}
	return olist;
}

export function openFiles(base, files, cb) {
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
					return openFiles(base, files, cb);
				}
			});
		}
	}
	return cb();
}

export function closeFiles(files, cb, elist = []) {
	var c = files.length;
	for (var i = 0; i < c; i++) {
		var obj = files[i];
		if (obj.fd)  {
			return fs.close(obj.fd, (err) => {
				obj.err = err;
				obj.fd = undefined;
				if (err) elist.push(obj);
				closeFiles(files, cb, elist);
			});
		}
	}
	return cb(elist.length ? elist : undefined);
}

export function readBlocks(files, cb, index = 0) {
	const fc = files.length;
	if (index === fc) return cb();
	const file = files[index];
	const bufSize = file.buf.length;
	return fs.read(file.fd, file.buf, 0, bufSize, file.pos, (err, bread) => {
		file.bread = bread;
		if (bread < bufSize) {
			file.eof = true;
			file.size = file.pos + bread;
		}
		if (err) {
			file.err = err;
			return cb(file, files);
		} else {
			return readBlocks(files, cb, index + 1);
		}
	});
}
