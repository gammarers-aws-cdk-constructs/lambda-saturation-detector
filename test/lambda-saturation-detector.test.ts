import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSaturationDetector, type AlarmConfig, type DurationNearTimeoutOptions } from '../src';
import { applySignals, resolveAlarmConfig, type SignalDraft } from '../src/lambda-saturation-detector';

const createStack = () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const alarmTopic = new Topic(stack, 'AlarmTopic');

  return { stack, alarmTopic };
};

const signal = (id: string, alarm?: AlarmConfig): SignalDraft => ({
  id,
  metric: new Metric({
    namespace: 'Test/Saturation',
    metricName: 'TestMetric',
    statistic: 'Sum',
    period: Duration.minutes(1),
  }),
  comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
  alarm,
});

test('creates no alarms when no signals are configured', () => {
  const { stack, alarmTopic } = createStack();
  const detector = new LambdaSaturationDetector(stack, 'Detector', { alarmTopic });

  expect(detector.alarmTopic).toBe(alarmTopic);

  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::CloudWatch::Alarm', 0);
  template.resourceCountIs('AWS::SNS::Topic', 1);
  expect(template.toJSON()).toMatchSnapshot();
});

test.each([
  {
    name: 'an omitted config',
    alarm: undefined,
    expected: {
      threshold: 1,
      periodSeconds: Duration.minutes(5).toSeconds(),
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    },
  },
  {
    name: 'an empty config',
    alarm: {},
    expected: {
      threshold: 1,
      periodSeconds: Duration.minutes(5).toSeconds(),
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    },
  },
  {
    name: 'overrides',
    alarm: {
      threshold: 0,
      period: Duration.minutes(10),
      evaluationPeriods: 3,
      treatMissingData: TreatMissingData.BREACHING,
    },
    expected: {
      threshold: 0,
      periodSeconds: Duration.minutes(10).toSeconds(),
      evaluationPeriods: 3,
      treatMissingData: TreatMissingData.BREACHING,
    },
  },
])('resolves alarm config for $name', ({ alarm, expected }) => {
  const resolved = resolveAlarmConfig(alarm);

  expect(resolved.threshold).toBe(expected.threshold);
  expect(resolved.period.toSeconds()).toBe(expected.periodSeconds);
  expect(resolved.evaluationPeriods).toBe(expected.evaluationPeriods);
  expect(resolved.treatMissingData).toBe(expected.treatMissingData);
});

test('creates an alarm with defaults and an ALARM action', () => {
  const { stack, alarmTopic } = createStack();

  applySignals(stack, alarmTopic, [signal('TestSignal')]);

  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    Threshold: 1,
    EvaluationPeriods: 1,
    TreatMissingData: 'notBreaching',
    ComparisonOperator: 'GreaterThanThreshold',
    AlarmActions: [stack.resolve(alarmTopic.topicArn)],
    OKActions: Match.absent(),
    InsufficientDataActions: Match.absent(),
    MetricName: 'TestMetric',
    Namespace: 'Test/Saturation',
    Period: Duration.minutes(5).toSeconds(),
    Statistic: 'Sum',
  });
});

test('creates no alarms when a later signal id is empty', () => {
  const { stack, alarmTopic } = createStack();

  expect(() => applySignals(stack, alarmTopic, [
    signal('ValidSignal'),
    signal(''),
  ])).toThrow('id is required.');

  Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 0);
});

const worker = (stack: Stack) => Function.fromFunctionName(stack, 'Worker', 'worker');

const ratioOptions = (field: 'p95Ratio' | 'p99Ratio', value: number): DurationNearTimeoutOptions => {
  if (field === 'p95Ratio') {
    return {
      timeout: Duration.seconds(10),
      p95Ratio: value,
    };
  }

  return {
    timeout: Duration.seconds(10),
    p99Ratio: value,
  };
};

const expectDurationRejected = (
  durationNearTimeout: DurationNearTimeoutOptions,
  message: string,
  withFunction = false,
) => {
  const { stack } = createStack();

  expect(() => new LambdaSaturationDetector(stack, 'Detector', {
    lambdaFunction: withFunction ? worker(stack) : undefined,
    durationNearTimeout,
  })).toThrow(message);
  Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 0);
};

const expectDurationAlarm = (
  stack: Stack,
  alarmTopic: Topic | undefined,
  statistic: string,
  threshold: number,
) => {
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    Threshold: threshold,
    EvaluationPeriods: 1,
    TreatMissingData: 'notBreaching',
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    ExtendedStatistic: statistic,
    MetricName: 'Duration',
    Namespace: 'AWS/Lambda',
    Period: Duration.minutes(5).toSeconds(),
    AlarmActions: alarmTopic === undefined ? Match.absent() : [stack.resolve(alarmTopic.topicArn)],
    OKActions: Match.absent(),
    InsufficientDataActions: Match.absent(),
    Dimensions: Match.arrayWith([
      Match.objectLike({ Name: 'FunctionName' }),
    ]),
  });
};

test('creates a p95 duration alarm with an ALARM action', () => {
  const { stack, alarmTopic } = createStack();
  const detector = new LambdaSaturationDetector(stack, 'Detector', {
    alarmTopic,
    lambdaFunction: worker(stack),
    durationNearTimeout: {
      timeout: Duration.seconds(10),
      p95Ratio: 0.8,
    },
  });

  expect(detector.alarmTopic).toBe(alarmTopic);
  Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 1);
  expectDurationAlarm(stack, alarmTopic, 'p95', 8_000);
});

test('creates a p99 duration alarm', () => {
  const { stack, alarmTopic } = createStack();

  new LambdaSaturationDetector(stack, 'Detector', {
    alarmTopic,
    lambdaFunction: worker(stack),
    durationNearTimeout: {
      timeout: Duration.seconds(10),
      p99Ratio: 0.95,
    },
  });

  Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 1);
  expectDurationAlarm(stack, alarmTopic, 'p99', 9_500);
});

test('creates p95 and p99 duration alarms', () => {
  const { stack, alarmTopic } = createStack();

  new LambdaSaturationDetector(stack, 'Detector', {
    alarmTopic,
    lambdaFunction: worker(stack),
    durationNearTimeout: {
      timeout: Duration.seconds(10),
      p95Ratio: 0.8,
      p99Ratio: 0.95,
    },
  });

  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::CloudWatch::Alarm', 2);
  expectDurationAlarm(stack, alarmTopic, 'p95', 8_000);
  expectDurationAlarm(stack, alarmTopic, 'p99', 9_500);
});

test('accepts a ratio of 1', () => {
  const { stack, alarmTopic } = createStack();

  new LambdaSaturationDetector(stack, 'Detector', {
    alarmTopic,
    lambdaFunction: worker(stack),
    durationNearTimeout: {
      timeout: Duration.seconds(10),
      p95Ratio: 1,
    },
  });

  Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 1);
  expectDurationAlarm(stack, alarmTopic, 'p95', 10_000);
});

test('creates a duration alarm without an alarm action when the topic is omitted', () => {
  const { stack } = createStack();
  const detector = new LambdaSaturationDetector(stack, 'Detector', {
    lambdaFunction: worker(stack),
    durationNearTimeout: {
      timeout: Duration.seconds(10),
      p95Ratio: 0.8,
    },
  });

  expect(detector.alarmTopic).toBeUndefined();
  Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 1);
  expectDurationAlarm(stack, undefined, 'p95', 8_000);
});

test.each([
  ['p95Ratio', 0, 'p95Ratio must be greater than 0 and at most 1.'],
  ['p95Ratio', 1.1, 'p95Ratio must be greater than 0 and at most 1.'],
  ['p95Ratio', Number.NaN, 'p95Ratio must be greater than 0 and at most 1.'],
  ['p99Ratio', 0, 'p99Ratio must be greater than 0 and at most 1.'],
  ['p99Ratio', 1.1, 'p99Ratio must be greater than 0 and at most 1.'],
  ['p99Ratio', Number.NaN, 'p99Ratio must be greater than 0 and at most 1.'],
] as const)('rejects %s %p', (field, value, message) => {
  expectDurationRejected(ratioOptions(field, value), message, true);
});

test('rejects a timeout of 0', () => {
  expectDurationRejected({
    timeout: Duration.millis(0),
    p95Ratio: 1,
  }, 'timeout must be greater than 0.', true);
});

test('rejects duration options when both ratios are omitted', () => {
  expectDurationRejected({
    timeout: Duration.seconds(10),
  }, 'p95Ratio or p99Ratio is required.');
});

test.each(['p95Ratio', 'p99Ratio'] as const)('rejects a rounded threshold of 0 for %s', (field) => {
  const durationNearTimeout: DurationNearTimeoutOptions = {
    timeout: Duration.millis(1),
    p95Ratio: field === 'p95Ratio' ? 0.4 : undefined,
    p99Ratio: field === 'p99Ratio' ? 0.4 : undefined,
  };
  const message = field === 'p95Ratio'
    ? 'timeout and p95Ratio round to a threshold below 1.'
    : 'timeout and p99Ratio round to a threshold below 1.';

  expectDurationRejected(durationNearTimeout, message, true);
});

test('requires lambdaFunction when durationNearTimeout is set', () => {
  expectDurationRejected({
    timeout: Duration.seconds(10),
    p95Ratio: 0.8,
  }, 'lambdaFunction is required.');
});

test('creates no alarms when one duration ratio is invalid', () => {
  expectDurationRejected({
    timeout: Duration.seconds(10),
    p95Ratio: 0.8,
    p99Ratio: Number.NaN,
  }, 'p99Ratio must be greater than 0 and at most 1.', true);
});
