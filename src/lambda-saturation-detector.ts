import { Duration } from 'aws-cdk-lib';
import { Alarm, Metric, TreatMissingData, type ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { type ITopic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

/** Alarm threshold used when a signal omits one. */
const DEFAULT_ALARM_THRESHOLD = 1;

/** Metric period used when a signal omits one. */
const DEFAULT_ALARM_PERIOD = Duration.minutes(5);

/** Evaluation periods used when a signal omits one. */
const DEFAULT_ALARM_EVALUATION_PERIODS = 1;

/** Missing-data treatment used when a signal omits one. */
const DEFAULT_ALARM_TREAT_MISSING_DATA = TreatMissingData.NOT_BREACHING;

/**
 * One saturation signal before it has been checked.
 *
 * Tests and later signal definitions build this value. It is not part of the package entry.
 */
export interface SignalDraft {
  /** Construct id for the alarm. An empty id is rejected before any alarm is created. */
  readonly id: string;
  /** Metric watched by the alarm. Statistic and metric name come from this metric. */
  readonly metric: Metric;
  /** Comparison applied to the metric and the resolved threshold. */
  readonly comparisonOperator: ComparisonOperator;
  /** Optional overrides. Omitted fields use the detector defaults. */
  readonly alarm?: AlarmConfig;
}

/**
 * Alarm settings with every field filled in.
 */
export interface ResolvedAlarmConfig {
  /** Threshold passed to the alarm. */
  readonly threshold: number;
  /** Period applied to the signal metric. */
  readonly period: Duration;
  /** Evaluation periods passed to the alarm. */
  readonly evaluationPeriods: number;
  /** Missing-data treatment passed to the alarm. */
  readonly treatMissingData: TreatMissingData;
}

/**
 * Fills omitted alarm settings with the detector defaults.
 *
 * A threshold of 0 is kept. Only an omitted field falls back to the default.
 *
 * @param alarm Per-signal overrides. Omit the object to use every default.
 * @returns Settings that can be applied to a CloudWatch alarm.
 */
export const resolveAlarmConfig = (alarm?: AlarmConfig): ResolvedAlarmConfig => {
  const config = alarm === undefined ? {} : alarm;

  return {
    threshold: config.threshold !== undefined ? config.threshold : DEFAULT_ALARM_THRESHOLD,
    period: config.period !== undefined ? config.period : DEFAULT_ALARM_PERIOD,
    evaluationPeriods: config.evaluationPeriods !== undefined
      ? config.evaluationPeriods
      : DEFAULT_ALARM_EVALUATION_PERIODS,
    treatMissingData: config.treatMissingData !== undefined
      ? config.treatMissingData
      : DEFAULT_ALARM_TREAT_MISSING_DATA,
  };
};

/**
 * Rejects a signal whose id is empty.
 *
 * @param signal Signal to check.
 * @throws Error when `id` is empty.
 */
const ensureSignalId = (signal: SignalDraft): void => {
  if (signal.id.length > 0) {
    return;
  }

  throw new Error('id is required.');
};

/**
 * Checks every signal before any alarm is created.
 *
 * @param signals Signals collected for this detector.
 * @returns The same signals when every id is usable.
 * @throws Error when a signal id is empty.
 */
const validateSignals = (signals: readonly SignalDraft[]): readonly SignalDraft[] => {
  for (const signal of signals) {
    ensureSignalId(signal);
  }

  return signals;
};

/**
 * Notifies the topic when the alarm enters ALARM.
 *
 * OK and INSUFFICIENT_DATA do not publish to the topic.
 *
 * @param alarm Alarm that receives the action.
 * @param topic Existing topic. One topic is attached.
 */
const attachAlarmAction = (alarm: Alarm, topic: ITopic): void => {
  alarm.addAlarmAction(new SnsAction(topic));
};

/**
 * Creates one alarm per signal that has already been validated.
 *
 * @param scope Parent of the alarms.
 * @param topic Topic attached to each alarm's ALARM action.
 * @param signals Validated signals.
 */
const createAlarms = (scope: Construct, topic: ITopic, signals: readonly SignalDraft[]): void => {
  for (const signal of signals) {
    const alarmConfig = resolveAlarmConfig(signal.alarm);

    // Apply the resolved period, including the 5 minute default, to the signal metric.
    const metric = signal.metric.with({ period: alarmConfig.period });

    // evaluationPeriods and treatMissingData are valid Alarm constructor props.
    // aws-cdk-lib 2.232 declares them on an internal interface whose .d.ts is empty,
    // so a fresh object literal is rejected. Passing a variable still type-checks and emits both fields.
    const alarmProps = {
      metric,
      threshold: alarmConfig.threshold,
      comparisonOperator: signal.comparisonOperator,
      evaluationPeriods: alarmConfig.evaluationPeriods,
      treatMissingData: alarmConfig.treatMissingData,
    };
    const alarm = new Alarm(scope, signal.id, alarmProps);

    attachAlarmAction(alarm, topic);
  }
};

/**
 * Validates every signal, then creates every alarm.
 *
 * A failure during validation throws before any alarm exists, so a signal added
 * later cannot leave a subset of alarms behind.
 *
 * @param scope Parent of the alarms.
 * @param topic Topic attached to each ALARM action.
 * @param signals Signals to validate and create. An empty list creates no alarms.
 * @throws Error when a signal id is empty.
 */
export const applySignals = (scope: Construct, topic: ITopic, signals: readonly SignalDraft[]): void => {
  const validated = validateSignals(signals);

  createAlarms(scope, topic, validated);
};

/**
 * Signals configured on the detector.
 *
 * No signals are built in yet, so the public construct creates no alarms.
 *
 * @returns The signals that will be validated.
 */
const collectSignals = (): readonly SignalDraft[] => [];

/**
 * Optional overrides for a saturation alarm.
 *
 * Omitted fields use threshold 1, a 5 minute period, 1 evaluation period,
 * and treat missing data as not breaching.
 */
export interface AlarmConfig {
  /**
   * Alarm threshold.
   *
   * @default 1
   */
  readonly threshold?: number;
  /**
   * Metric period.
   *
   * @default Duration.minutes(5)
   */
  readonly period?: Duration;
  /**
   * Number of periods to evaluate.
   *
   * @default 1
   */
  readonly evaluationPeriods?: number;
  /**
   * How to treat missing data.
   *
   * @default TreatMissingData.NOT_BREACHING
   */
  readonly treatMissingData?: TreatMissingData;
}

/**
 * Properties for {@link LambdaSaturationDetector}.
 */
export interface LambdaSaturationDetectorProps {
  /**
   * Existing SNS topic notified when an alarm enters ALARM.
   *
   * The construct does not create a topic. OK and INSUFFICIENT_DATA do not notify this topic.
   */
  readonly alarmTopic: ITopic;
}

/**
 * CloudWatch alarms for configured Lambda saturation signals.
 *
 * Every signal is validated before any alarm is created. With no signals configured,
 * the construct creates no alarms. The topic is notified only when an alarm enters ALARM.
 */
export class LambdaSaturationDetector extends Construct {
  /**
   * SNS topic notified when an alarm enters ALARM.
   */
  public readonly alarmTopic: ITopic;

  /**
   * @param scope Parent construct.
   * @param id Construct id.
   * @param props Alarm topic. The construct does not create a topic.
   */
  constructor(scope: Construct, id: string, props: LambdaSaturationDetectorProps) {
    super(scope, id);

    this.alarmTopic = props.alarmTopic;

    // Validation finishes before any alarm is created, so a signal added later
    // cannot leave a partial set of alarms behind.
    const signals = collectSignals();
    applySignals(this, this.alarmTopic, signals);
  }
}
