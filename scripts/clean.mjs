import { rm } from 'fs/promises';
import { resolve } from 'path';

const paths = ['dist', 'coverage'];
await Promise.all(paths.map((path) => rm(resolve(path), { recursive: true, force: true })));
