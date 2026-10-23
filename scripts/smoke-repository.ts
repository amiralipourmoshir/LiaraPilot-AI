import { GithubRepository } from '../packages/github-adapter/src/index.js';
const manifest = await new GithubRepository().analyze(
  'https://github.com/liara-cloud/nodejs-getting-started',
);
console.log(
  JSON.stringify({
    repository: `${manifest.owner}/${manifest.repo}`,
    commit: manifest.commit,
    framework: manifest.framework,
    files: manifest.files.length,
    blockers: manifest.blockers,
  }),
);
