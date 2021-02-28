import fs from "fs";
import path from "path";
import parseTorrent from "parse-torrent";

run(processArgv(process.argv));

function run(opt) {
	const {base, file} = opt;
	fs.readFile(path.resolve(base, file), (err, data) => {
		if (err) return console.error(`Error reading file`, err);
		data = parseTorrent(data);
		console.log(getLongestCommonPath(data.files));
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
		const p = files[i].path.split('/');
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
