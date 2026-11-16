import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
const project = new ProjenCdkConstructLibrary({
  cdkVersion: '2.232.0',
  name: 'lambda-saturation-detector',
  repositoryUrl: 'https://github.com/gammarers-aws-cdk-constructs/lambda-saturation-detector.git',
  devDeps: [
    '@gammarers/projen-projects@^0.8.1',
  ],
});
project.synth();