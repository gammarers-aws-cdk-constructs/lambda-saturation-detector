# Lambda Saturation Detector (CDK v2)

[![npm version](https://img.shields.io/npm/v/lambda-saturation-detector?style=flat-square)](https://www.npmjs.com/package/lambda-saturation-detector)
[![license](https://img.shields.io/npm/l/lambda-saturation-detector?style=flat-square)](https://www.npmjs.com/package/lambda-saturation-detector)
[![Node.js](https://img.shields.io/node/v/lambda-saturation-detector?style=flat-square)](https://www.npmjs.com/package/lambda-saturation-detector)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/lambda-saturation-detector/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/lambda-saturation-detector/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=lambda-saturation-detector)](https://constructs.dev/packages/lambda-saturation-detector)

Creates CloudWatch alarms when a Lambda function's duration nears its timeout, its concurrent executions reach a threshold, or provisioned concurrency spills over. An existing SNS topic is notified when an alarm enters the ALARM state.

## Features

- Alarms when p95 or p99 Duration nears the function timeout
- Alarms when ConcurrentExecutions reaches a threshold
- Alarms when provisioned concurrency invocations spill over
- Notifies an existing SNS topic on ALARM when a topic is provided
- Creates no alarms when no signals are configured
- Validates every signal before creating any alarm
- Treats missing metric data as not breaching by default

## How it works

1. Pass the function as `lambdaFunction` and at least one signal: `durationNearTimeout`, `concurrentExecutions`, or `provisionedConcurrencySpillover`. Pass an existing SNS topic as `alarmTopic` when notifications are needed. This construct does not create a topic.
2. Configured signals are validated first. If validation fails, no alarms are created, including alarms for signals that were already checked.
3. One CloudWatch alarm is then created for each requested signal. With no signals, the construct creates no alarms.
4. A duration threshold is the timeout in milliseconds multiplied by the ratio, rounded to the nearest integer. p95 uses the `p95` statistic and p99 uses `p99`, both on the function's Duration metric. A concurrent executions alarm uses ConcurrentExecutions, the Maximum statistic, and the FunctionName dimension. Its threshold is `concurrentExecutions.threshold`. `alarmConfig.threshold` does not change either of those signals.
5. A provisioned concurrency spillover alarm uses ProvisionedConcurrencySpilloverInvocations and the Sum statistic. Set `resource` to add that string as the Resource dimension next to FunctionName. Omit it to watch FunctionName only. An explicit `threshold` wins. Otherwise the alarm uses `alarmConfig.threshold`, which defaults to 1.
6. The topic is notified only when an alarm enters ALARM. OK and INSUFFICIENT_DATA do not publish to the topic. Omitting `alarmTopic` leaves the alarms without an alarm action.

Period, evaluation periods, and missing-data treatment below are not configurable via props today. The generic threshold of 1 is not used for the duration signal or the concurrent executions signal. Provisioned concurrency spillover uses it when both its own threshold and `alarmConfig.threshold` are omitted.

| Setting | Default |
| --- | --- |
| Period | 5 minutes |
| Evaluation periods | 1 |
| Missing data | not breaching |

## Installation

### npm

```bash
npm install lambda-saturation-detector
```

### yarn

```bash
yarn add lambda-saturation-detector
```

### pnpm

```bash
pnpm add lambda-saturation-detector
```

## Usage

### Minimal deployable app

Use an inline stack when you want a dedicated stack you can deploy as-is. This package does not publish a stack class.

```typescript
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSaturationDetector } from 'lambda-saturation-detector';

const app = new App();
const stack = new Stack(app, 'LambdaSaturationDetectorStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const alarmTopic = new Topic(stack, 'AlarmTopic');
const timeout = Duration.seconds(10);
const lambdaFunction = new Function(stack, 'Worker', {
  runtime: Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: Code.fromInline('exports.handler = async () => undefined;'),
  timeout,
});

new LambdaSaturationDetector(stack, 'LambdaSaturationDetector', {
  alarmTopic,
  lambdaFunction,
  durationNearTimeout: {
    timeout,
    p95Ratio: 0.8,
    p99Ratio: 0.9,
  },
});

app.synth();
```

Deploy checklist:

1. Install this package and peers (`aws-cdk-lib`, `constructs`) in your CDK app.
2. Provide the Lambda function to watch. The sample creates one. Set `durationNearTimeout.timeout` to that function's timeout.
3. Provide an SNS topic when ALARM notifications are needed. The sample creates one. Omit `alarmTopic` to create alarms without an action.
4. From the CDK app: `npx cdk deploy LambdaSaturationDetectorStack`

### Provisioned concurrency spillover

`resource` is stored as the Resource dimension. Omit `provisionedConcurrencySpillover.threshold` to use `alarmConfig.threshold`, which defaults to 1. Set that threshold to override the shared value.

```typescript
import { App, Stack } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSaturationDetector } from 'lambda-saturation-detector';

const app = new App();
const stack = new Stack(app, 'ProvisionedConcurrencySpilloverStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const alarmTopic = new Topic(stack, 'AlarmTopic');
const lambdaFunction = new Function(stack, 'Worker', {
  runtime: Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: Code.fromInline('exports.handler = async () => undefined;'),
});

new LambdaSaturationDetector(stack, 'LambdaSaturationDetector', {
  alarmTopic,
  lambdaFunction,
  alarmConfig: {
    threshold: 5,
  },
  provisionedConcurrencySpillover: {
    resource: 'live',
  },
});

app.synth();
```

Deploy with the same checklist. From the CDK app: `npx cdk deploy ProvisionedConcurrencySpilloverStack`

## Options

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `alarmTopic` | `ITopic` | No | none | Existing SNS topic for the ALARM action. The construct does not create this topic. Omit it to create alarms without an action. |
| `alarmConfig` | `AlarmConfig` | No | threshold `1` | Shared alarm settings. Spillover uses `threshold` when its own threshold is omitted. Duration and concurrent executions alarms do not use it. Period, evaluation periods, and missing-data treatment are not configurable via props today. |
| `lambdaFunction` | `IFunction` | When a signal is set | none | Function whose metrics are watched. |
| `durationNearTimeout` | `DurationNearTimeoutOptions` | No | none | p95 and p99 alarms that fire as Duration nears the function timeout. |
| `durationNearTimeout.timeout` | `Duration` | Yes, when the signal is set | | Function timeout. Must be greater than 0. |
| `durationNearTimeout.p95Ratio` | `number` | One of the ratios | none | Fraction of `timeout` for p95. Greater than 0 and at most 1. |
| `durationNearTimeout.p99Ratio` | `number` | One of the ratios | none | Fraction of `timeout` for p99. Greater than 0 and at most 1. |
| `concurrentExecutions` | `ConcurrentExecutionsOptions` | No | none | Alarm when ConcurrentExecutions reaches `threshold`. Uses the Maximum statistic and the FunctionName dimension. |
| `concurrentExecutions.threshold` | `number` | Yes, when the signal is set | | Finite number greater than 0. `alarmConfig.threshold` does not change this value. |
| `provisionedConcurrencySpillover` | `ProvisionedConcurrencySpilloverOptions` | No | none | Alarm when ProvisionedConcurrencySpilloverInvocations reaches a threshold. Uses the Sum statistic. |
| `provisionedConcurrencySpillover.resource` | `string` | No | none | Resource dimension value, stored as given. Must not be blank. Omit it to watch FunctionName only. |
| `provisionedConcurrencySpillover.threshold` | `number` | No | `alarmConfig.threshold`, or `1` | Finite number greater than 0 when set. Overrides `alarmConfig.threshold`. |
| `AlarmConfig.period` | `Duration` | No | 5 minutes | Alarm period. Not configurable via props today. |
| `AlarmConfig.evaluationPeriods` | `number` | No | `1` | Evaluation periods. Not configurable via props today. |
| `AlarmConfig.treatMissingData` | `TreatMissingData` | No | `NOT_BREACHING` | Missing-data treatment. Not configurable via props today. |

## API

See [API.md](./API.md).

## Requirements

- Node.js >= 20.0.0
- aws-cdk-lib ^2.232.0
- constructs ^10.5.1

## License

This project is licensed under the Apache-2.0 License.
