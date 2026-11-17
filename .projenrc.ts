import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
const project = new ProjenCdkConstructLibrary({
  cdkVersion: '2.232.0',
  name: 'lambda-saturation-detector',
  description: 'Creates CloudWatch alarms when a Lambda function nears its timeout, its concurrent executions reach a threshold, or provisioned concurrency spills over, and notifies an existing SNS topic on ALARM.',
  repositoryUrl: 'https://github.com/gammarers-aws-cdk-constructs/lambda-saturation-detector.git',
  releaseToNpm: true,
  npmTrustedPublishing: true,
  devDeps: [
    '@gammarers/projen-projects@^0.8.1',
  ],
});
project.synth();