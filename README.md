# Lambda Saturation Detector (CDK v2)

[![npm version](https://img.shields.io/npm/v/lambda-saturation-detector?style=flat-square)](https://www.npmjs.com/package/lambda-saturation-detector)
[![license](https://img.shields.io/npm/l/lambda-saturation-detector?style=flat-square)](https://www.npmjs.com/package/lambda-saturation-detector)
[![Node.js](https://img.shields.io/node/v/lambda-saturation-detector?style=flat-square)](https://www.npmjs.com/package/lambda-saturation-detector)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/lambda-saturation-detector/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/lambda-saturation-detector/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=lambda-saturation-detector)](https://constructs.dev/packages/lambda-saturation-detector)

Creates CloudWatch alarms for configured Lambda saturation signals. An existing SNS topic is notified when an alarm enters the ALARM state.

## Features

- Notifies an existing SNS topic when a saturation alarm enters ALARM
- Creates no alarms when no signals are configured
- Validates every signal before creating any alarm
- Treats missing metric data as not breaching by default

## How it works

1. Pass an existing SNS topic as `alarmTopic`. This construct does not create a topic.
2. Configured signals are validated first. If validation fails, no alarms are created, including alarms for signals that were already checked.
3. One CloudWatch alarm is then created for each valid signal. No signals are configured by props today, so the construct creates no alarms.
4. The topic is notified only when an alarm enters ALARM. OK and INSUFFICIENT_DATA do not publish to the topic.

Alarm defaults below are used when a signal does not override them. Overrides are not configurable via props today.

| Setting | Default |
| --- | --- |
| Threshold | 1 |
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
import { App, Stack } from 'aws-cdk-lib';
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

new LambdaSaturationDetector(stack, 'LambdaSaturationDetector', {
  alarmTopic,
});

app.synth();
```

Deploy checklist:

1. Install this package and peers (`aws-cdk-lib`, `constructs`) in your CDK app.
2. Provide an SNS topic. The sample creates one in the stack. You can pass an existing topic instead.
3. From the CDK app: `npx cdk deploy LambdaSaturationDetectorStack`

## Options

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `alarmTopic` | `ITopic` | Yes | | Existing SNS topic for the ALARM action. The construct does not create this topic. |
| `AlarmConfig.threshold` | `number` | No | `1` | Per-signal threshold. Not configurable via props today. |
| `AlarmConfig.period` | `Duration` | No | 5 minutes | Per-signal period. Not configurable via props today. |
| `AlarmConfig.evaluationPeriods` | `number` | No | `1` | Per-signal evaluation periods. Not configurable via props today. |
| `AlarmConfig.treatMissingData` | `TreatMissingData` | No | `NOT_BREACHING` | Per-signal missing-data treatment. Not configurable via props today. |

## API

See [API.md](./API.md).

## Requirements

- Node.js >= 20.0.0
- aws-cdk-lib ^2.232.0
- constructs ^10.5.1

## License

This project is licensed under the Apache-2.0 License.
