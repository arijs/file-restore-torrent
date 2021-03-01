import fs from "fs";
import path from "path";
import crypto from "crypto";
import parseTorrent from "parse-torrent";
import {
	filePathsToObjects,
	openFiles,
	closeFiles,
	readBlocks,
} from "./shared/files.mjs";

run(processArgv(process.argv));

const rePathSep = /\/+/g;

function run(opt) {
	const {base, file} = opt;
	fs.readFile(path.resolve(base, file), (err, data) => {
		if (err) return console.error(`Error reading file`, err);
		data = parseTorrent(data);
		const {files: tfiles, info: { pieces }} = data;
		const lcp = getLongestCommonPath(tfiles);
		const f0p = tfiles[0].path;
		const f0f = removeBeginDirs(f0p, lcp);
		const pc = data.pieces.length;
		const bufSize = pc === 1 ? data.lastPieceLength : data.pieceLength;
		console.log(`Common:`, lcp);
		console.log(`First file path:`, f0p);
		console.log(`Base removed:`, f0f);
		console.log(`Piece length:`, bufSize);
		const files = filePathsToObjects([f0f], bufSize);
		openFiles(base, files, ef => {
			if (ef) {
				const {err, dir, file} = ef;
				return console.error(`Error opening file`, {err, dir, file});
			}
			readBlocks(files, ef => {
				if (ef) {
					const {err, dir, file} = ef;
					console.error(`Error reading file`, {err, dir, file});
					return closeFiles(files, elist => {
						if (elist) {
							console.error(`Error closing ${elist.length} files`, err);
						}
					});
				}
				const [file] = files;
				const expected = pieces.slice(0, 20);
				const {match, digest} = hashBuffer(file.buf, 'sha1', expected);
				if (match) {
					console.error(`  ✔ Hashes match for file ${file.dir}/${file.file} at pos ${file.pos} len ${bufSize}`);
				} else {
					console.error(`  ✖ Hash Error for file ${file.dir}/${file.file} at pos ${file.pos} len ${bufSize}`);
					console.error(`Expected:`, expected);
					console.error(`Actual:`, digest);
				}
				return closeFiles(files, elist => {
					if (elist) {
						console.error(`Error closing ${elist.length} files`, err);
					}
				});
			});
		});
	});
}

function processArgv(argv) {
	var file = null;
	var base = process.cwd();
	var aname = '';
	var c = argv.length;
	for (var i = 2; i < c; i++) {
		var av = String(argv[i]);
		if (av.charAt(0) === '-') {
			if (av === '-f' || av === '--file') {
				aname = 'f';
			} else
			if (av === '-b' || av === '--base') {
				aname = 'b';
			}
		} else
		if (aname === 'f') {
			file = av;
		} else
		if (aname === 'b') {
			base = av;
		}
	}
	return {
		base,
		file,
	};
}

function getLongestCommonPath(files) {
	let longest;
	const fc = files.length;
	for (let i = 0; i < fc; i++) {
		const p = files[i].path.split(rePathSep);
		p.pop();
		if (longest) {
			let j;
			let lc = longest.length;
			let pc = Math.min(lc, p.length);
			for (j = 0; j < pc; j++) {
				if (p[j] !== longest[j]) break;
			}
			longest.splice(j, lc - j);
		} else {
			longest = p;
		}
		if (!longest.length) break;
	}
	return longest;
}

function removeBeginDirs(fpath, remove) {
	fpath = fpath.split(rePathSep);
	const fname = fpath.pop();
	let rc = remove.length;
	let pc = fpath.length;
	for (;;) {
		if (rc && pc) {
			if (remove[0] === fpath[0]) {
				remove.shift(), rc--;
				fpath.shift(), pc--;
			}
		}
		if (!rc || !pc) break;
	}
	fpath.push(fname);
	return fpath.join('/');
}

function hashBuffer(buf, algo, expected) {
	const hash = crypto.createHash(algo);
	hash.update(buf);
	const digest = hash.digest();
	const len = Math.max(expected.length, digest.length);
	let i;
	for (i = 0; i < len; i++) {
		if (digest[i] !== expected[i]) break;
	}
	return {
		match: i === len,
		digest,
	};
}
