import { mkdir, readdir, copyFile } from 'fs/promises';
import { resolve, join } from 'path';

const sourceDir = resolve('src/styles');
const destinationDir = resolve('dist/src/styles');

await mkdir(destinationDir, { recursive: true });
const entries = await readdir(sourceDir, { withFileTypes: true });

await Promise.all(
  entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => copyFile(join(sourceDir, entry.name), join(destinationDir, entry.name)))
);
