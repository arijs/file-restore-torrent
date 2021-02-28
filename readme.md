# File Restore Torrent

I have a problem. I had files stored on optical media disks (dvds) which are over ten years old. When I copy the files to the hard disk on my computer and verify them using a torrent file, some pieces are broken. But I noticed that each time that I copied the file, it was a different amount of pieces inside that file that were broken. So I thought that some bytes were coming wrong during the copy, but not always the same bytes, it looks like each byte had a random chance of being copied with an error.

So, with that in mind, I decided to take an average: copy the files many times, and then write a NodeJS script that compared many copies at the same time, compare each byte in each file and detect bytes that were different in two files or more. When an error is detected, get each byte value from each file and insert in a list, and then verify in that list how many times each byte value has been found.

For example, assume I have three copies of one file: a1.txt, a2.txt and a3.txt. At a byte position 37, files a1 and a2 have a value '5f', but file a3 has the value '5e'. That makes the value '5f' the most frequent value for that byte position, so it becomes my first candidate for the correct value for that byte. I do this for all bytes in the file, and I save a list of most frequent values for all bytes that have a different value in one or more copies.

Then I write a new file, composed with all bytes that are equal in all files, and on the bytes that had errors, I write the most common value for that byte position. That makes the file an 'average' of the copies.

I was able to get the amount of broken pieces for that file down in the torrent, but I still couldn't achieve a perfect error correction for one file with 7 or 8 copies. I still need to either (a) automate a brute-force testing attempt, or (b) improve the algorithm, testing and finding fixes for each piece, one at a time, instead of the whole file.

Contributions welcome!

## How to run

```
node ./index.mjs --base /my/path/for/files --files 'a1.txt' 'a2.txt' 'a3.txt' > average.txt
```

### Script arguments

- `--base`
  The base path from where all file paths will be resolved. File paths will be considered as being relative from this base.

- `--files`
  List of file names from all the copies you wish to compare, separated by spaces. You can use as many files as you want.

The script has other parameters but they are not yet configurable from the command line.

### Script output

The averaged file will be output to `stdout`, and you can pipe it to a file path to save it.
Also many log lines are printed to `stderr` so you can see what the script is doing.

## License

[MIT](LICENSE).
