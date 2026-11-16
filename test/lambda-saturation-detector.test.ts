import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSaturationDetector, type AlarmConfig } from '../src';
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
