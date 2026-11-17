import { Duration } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Metric, Stats, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { type IFunction } from 'aws-cdk-lib/aws-lambda';
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

/** p95 statistic passed to {@link IFunction.metricDuration}. */
const STATISTIC_P95 = Stats.p(95);

/** p99 statistic passed to {@link IFunction.metricDuration}. */
const STATISTIC_P99 = Stats.p(99);

/** Construct id for the p95 duration alarm. */
const DURATION_P95_ALARM_ID = 'DurationP95';

/** Construct id for the p99 duration alarm. */
const DURATION_P99_ALARM_ID = 'DurationP99';

/** ConcurrentExecutions metric on the AWS/Lambda namespace. */
const METRIC_CONCURRENT_EXECUTIONS = 'ConcurrentExecutions';

/** Maximum statistic for the concurrent executions alarm. */
const STATISTIC_MAXIMUM = Stats.MAXIMUM;

/** Construct id for the concurrent executions alarm. */
const CONCURRENT_EXECUTIONS_ALARM_ID = 'ConcurrentExecutions';

/** ProvisionedConcurrencySpilloverInvocations metric on the AWS/Lambda namespace. */
const METRIC_PROVISIONED_CONCURRENCY_SPILLOVER = 'ProvisionedConcurrencySpilloverInvocations';

/** Sum statistic for the provisioned concurrency spillover alarm. */
const STATISTIC_SUM = Stats.SUM;

/** FunctionName dimension on Lambda metrics. */
const DIMENSION_FUNCTION_NAME = 'FunctionName';

/** Resource dimension on the provisioned concurrency spillover metric. */
const DIMENSION_RESOURCE = 'Resource';

/** Construct id for the provisioned concurrency spillover alarm. */
const PROVISIONED_CONCURRENCY_SPILLOVER_ALARM_ID = 'ProvisionedConcurrencySpillover';

/** Thrown when a signal is set and `lambdaFunction` is omitted. */
const LAMBDA_FUNCTION_REQUIRED_MESSAGE = 'lambdaFunction is required.';

type DurationRatioField = 'p95Ratio' | 'p99Ratio';

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
 * @param topic Topic attached to each alarm's ALARM action. Omit it to create alarms without an action.
 * @param signals Validated signals.
 */
const createAlarms = (scope: Construct, topic: ITopic | undefined, signals: readonly SignalDraft[]): void => {
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
    if (topic === undefined) {
      continue;
    }

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
 * @param topic Topic attached to each ALARM action. Omit it to create alarms without an action.
 * @param signals Signals to validate and create. An empty list creates no alarms.
 * @throws Error when a signal id is empty.
 */
export const applySignals = (
  scope: Construct,
  topic: ITopic | undefined,
  signals: readonly SignalDraft[],
): void => {
  const validated = validateSignals(signals);

  createAlarms(scope, topic, validated);
};

/**
 * Threshold in milliseconds for a duration alarm.
 *
 * @param timeout Function timeout.
 * @param ratio Fraction of the timeout. Callers pass a ratio that has already been checked.
 * @returns Rounded milliseconds.
 */
const resolveDurationThreshold = (timeout: Duration, ratio: number): number =>
  Math.round(timeout.toMilliseconds() * ratio);

/**
 * Rejects a ratio outside (0, 1], including NaN.
 *
 * @param ratio Candidate ratio.
 * @param field Ratio field on {@link DurationNearTimeoutOptions}.
 * @throws Error when `field` is not greater than 0 and at most 1.
 */
const ensureDurationRatio = (ratio: number, field: DurationRatioField): void => {
  if (!Number.isNaN(ratio) && ratio > 0 && ratio <= 1) {
    return;
  }

  throw new Error(`${field} must be greater than 0 and at most 1.`);
};

/**
 * Rejects a rounded timeout threshold of 0 or less.
 *
 * @param timeout Function timeout.
 * @param ratio Ratio that has already passed {@link ensureDurationRatio}.
 * @param field Ratio field on {@link DurationNearTimeoutOptions}.
 * @throws Error when `timeout` and `field` round to a threshold below 1.
 */
const ensureDurationThreshold = (timeout: Duration, ratio: number, field: DurationRatioField): void => {
  if (resolveDurationThreshold(timeout, ratio) > 0) {
    return;
  }

  throw new Error(`timeout and ${field} round to a threshold below 1.`);
};

/**
 * Checks one ratio when the caller set it.
 *
 * @param ratio Ratio, or undefined when that percentile is not requested.
 * @param field Ratio field on {@link DurationNearTimeoutOptions}.
 */
const ensurePresentRatio = (ratio: number | undefined, field: DurationRatioField): void => {
  if (ratio === undefined) {
    return;
  }

  ensureDurationRatio(ratio, field);
};

/**
 * Checks the rounded threshold for one ratio when the caller set it.
 *
 * @param timeout Function timeout.
 * @param ratio Ratio, or undefined when that percentile is not requested.
 * @param field Ratio field on {@link DurationNearTimeoutOptions}.
 */
const ensurePresentThreshold = (
  timeout: Duration,
  ratio: number | undefined,
  field: DurationRatioField,
): void => {
  if (ratio === undefined) {
    return;
  }

  ensureDurationThreshold(timeout, ratio, field);
};

/**
 * Builds one duration alarm draft.
 *
 * The threshold is the rounded timeout fraction, not the generic default of 1.
 *
 * @param lambdaFunction Function whose Duration metric is watched.
 * @param id Construct id.
 * @param statistic p95 or p99.
 * @param timeout Function timeout.
 * @param ratio Checked ratio.
 * @returns A draft that has not created an alarm yet.
 */
const durationSignal = (
  lambdaFunction: IFunction,
  id: string,
  statistic: string,
  timeout: Duration,
  ratio: number,
): SignalDraft => {
  const resolved = resolveAlarmConfig();

  return {
    id,
    metric: lambdaFunction.metricDuration({
      statistic,
      period: resolved.period,
    }),
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    alarm: {
      threshold: resolveDurationThreshold(timeout, ratio),
      period: resolved.period,
      evaluationPeriods: resolved.evaluationPeriods,
      treatMissingData: resolved.treatMissingData,
    },
  };
};

/**
 * Builds p95 and p99 drafts for a duration option that has already been validated.
 *
 * @param lambdaFunction Function whose Duration metric is watched.
 * @param options Validated duration options. At least one ratio is set.
 * @returns Drafts in p95 then p99 order.
 */
const collectDurationSignals = (
  lambdaFunction: IFunction,
  options: DurationNearTimeoutOptions,
): SignalDraft[] => {
  const signals: SignalDraft[] = [];
  const p95Ratio = options.p95Ratio;
  if (p95Ratio !== undefined) {
    signals.push(durationSignal(lambdaFunction, DURATION_P95_ALARM_ID, STATISTIC_P95, options.timeout, p95Ratio));
  }

  const p99Ratio = options.p99Ratio;
  if (p99Ratio !== undefined) {
    signals.push(durationSignal(lambdaFunction, DURATION_P99_ALARM_ID, STATISTIC_P99, options.timeout, p99Ratio));
  }

  return signals;
};

/**
 * Validates the duration signal, then returns its alarm drafts.
 *
 * An omitted option produces no drafts. Any failure throws before an alarm exists.
 *
 * @param props Detector properties.
 * @returns Duration drafts. Empty when the signal is not configured.
 * @throws Error when timeout, a ratio, the rounded threshold, or lambdaFunction is invalid.
 */
const resolveDurationSignals = (props: LambdaSaturationDetectorProps): SignalDraft[] => {
  const options = props.durationNearTimeout;
  if (options === undefined) {
    return [];
  }

  if (options.timeout.toMilliseconds() <= 0) {
    throw new Error('timeout must be greater than 0.');
  }

  ensurePresentRatio(options.p95Ratio, 'p95Ratio');
  ensurePresentRatio(options.p99Ratio, 'p99Ratio');
  if (options.p95Ratio === undefined && options.p99Ratio === undefined) {
    throw new Error('p95Ratio or p99Ratio is required.');
  }

  ensurePresentThreshold(options.timeout, options.p95Ratio, 'p95Ratio');
  ensurePresentThreshold(options.timeout, options.p99Ratio, 'p99Ratio');
  const lambdaFunction = props.lambdaFunction;
  if (lambdaFunction === undefined) {
    throw new Error(LAMBDA_FUNCTION_REQUIRED_MESSAGE);
  }

  return collectDurationSignals(lambdaFunction, options);
};

/**
 * Rejects a threshold that is not finite or is not greater than 0.
 *
 * @param threshold Candidate threshold.
 * @throws Error when `threshold` is not a finite number greater than 0.
 */
const ensurePositiveThreshold = (threshold: number): void => {
  if (Number.isFinite(threshold) && threshold > 0) {
    return;
  }

  throw new Error('threshold must be a finite number greater than 0.');
};

/**
 * Builds the concurrent executions alarm draft.
 *
 * The threshold is the value on the options. {@link LambdaSaturationDetectorProps.alarmConfig}
 * is not applied, so its threshold cannot change this alarm.
 *
 * @param lambdaFunction Function whose ConcurrentExecutions metric is watched.
 * @param threshold Checked threshold.
 * @returns A draft that has not created an alarm yet.
 */
const concurrentExecutionsSignal = (
  lambdaFunction: IFunction,
  threshold: number,
): SignalDraft => {
  const resolved = resolveAlarmConfig({ threshold });

  return {
    id: CONCURRENT_EXECUTIONS_ALARM_ID,
    metric: lambdaFunction.metric(METRIC_CONCURRENT_EXECUTIONS, {
      statistic: STATISTIC_MAXIMUM,
      period: resolved.period,
    }),
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    alarm: resolved,
  };
};

/**
 * Validates the concurrent executions signal, then returns its alarm draft.
 *
 * An omitted option produces no drafts. Any failure throws before an alarm exists.
 *
 * @param props Detector properties.
 * @returns One draft, or an empty list when the signal is not configured.
 * @throws Error when `threshold` is invalid or `lambdaFunction` is missing.
 */
const resolveConcurrentExecutionsSignals = (props: LambdaSaturationDetectorProps): SignalDraft[] => {
  const options = props.concurrentExecutions;
  if (options === undefined) {
    return [];
  }

  ensurePositiveThreshold(options.threshold);
  const lambdaFunction = props.lambdaFunction;
  if (lambdaFunction === undefined) {
    throw new Error(LAMBDA_FUNCTION_REQUIRED_MESSAGE);
  }

  return [concurrentExecutionsSignal(lambdaFunction, options.threshold)];
};

/**
 * Rejects a spillover resource that is only whitespace.
 *
 * An omitted resource is allowed. The stored value is not trimmed.
 *
 * @param resource Resource dimension value on {@link ProvisionedConcurrencySpilloverOptions}.
 * @throws Error when `resource` is blank.
 */
const ensureSpilloverResource = (resource: string | undefined): void => {
  if (resource === undefined || resource.trim().length > 0) {
    return;
  }

  throw new Error('resource must not be blank.');
};

/**
 * Checks an explicit spillover threshold.
 *
 * An omitted threshold is allowed and falls back to {@link AlarmConfig.threshold}.
 *
 * @param threshold Threshold on {@link ProvisionedConcurrencySpilloverOptions}.
 * @throws Error when `threshold` is set and is not a finite number greater than 0.
 */
const ensurePresentPositiveThreshold = (threshold: number | undefined): void => {
  if (threshold === undefined) {
    return;
  }

  ensurePositiveThreshold(threshold);
};

/**
 * Chooses the spillover alarm threshold.
 *
 * An explicit threshold wins. Otherwise {@link AlarmConfig.threshold} is used, which defaults to 1.
 *
 * @param options Spillover options. An explicit threshold has already been checked.
 * @param alarmConfig Shared alarm settings.
 * @returns Threshold passed to the alarm.
 */
const resolveSpilloverThreshold = (
  options: ProvisionedConcurrencySpilloverOptions,
  alarmConfig: AlarmConfig | undefined,
): number => {
  if (options.threshold !== undefined) {
    return options.threshold;
  }

  return resolveAlarmConfig(alarmConfig).threshold;
};

/**
 * Builds the spillover metric.
 *
 * Passing `dimensionsMap` replaces the FunctionName dimension that `metric` adds,
 * so a resource includes both FunctionName and Resource. An omitted resource keeps FunctionName only.
 *
 * @param lambdaFunction Function whose spillover metric is watched.
 * @param period Metric period.
 * @param resource Resource dimension value, or undefined to omit that dimension.
 * @returns Metric for the spillover alarm.
 */
const spilloverMetric = (
  lambdaFunction: IFunction,
  period: Duration,
  resource: string | undefined,
): Metric => {
  if (resource === undefined) {
    return lambdaFunction.metric(METRIC_PROVISIONED_CONCURRENCY_SPILLOVER, {
      statistic: STATISTIC_SUM,
      period,
    });
  }

  return lambdaFunction.metric(METRIC_PROVISIONED_CONCURRENCY_SPILLOVER, {
    statistic: STATISTIC_SUM,
    period,
    dimensionsMap: {
      [DIMENSION_FUNCTION_NAME]: lambdaFunction.functionName,
      [DIMENSION_RESOURCE]: resource,
    },
  });
};

/**
 * Builds the provisioned concurrency spillover alarm draft.
 *
 * @param lambdaFunction Function whose spillover metric is watched.
 * @param threshold Resolved threshold.
 * @param resource Resource dimension value, or undefined when that dimension is omitted.
 * @returns A draft that has not created an alarm yet.
 */
const provisionedConcurrencySpilloverSignal = (
  lambdaFunction: IFunction,
  threshold: number,
  resource: string | undefined,
): SignalDraft => {
  const resolved = resolveAlarmConfig({ threshold });

  return {
    id: PROVISIONED_CONCURRENCY_SPILLOVER_ALARM_ID,
    metric: spilloverMetric(lambdaFunction, resolved.period, resource),
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    alarm: resolved,
  };
};

/**
 * Validates the spillover signal, then returns its alarm draft.
 *
 * An omitted option produces no drafts. Any failure throws before an alarm exists.
 *
 * @param props Detector properties.
 * @returns One draft, or an empty list when the signal is not configured.
 * @throws Error when `resource` is blank, an explicit `threshold` is invalid, or `lambdaFunction` is missing.
 */
const resolveProvisionedConcurrencySpilloverSignals = (
  props: LambdaSaturationDetectorProps,
): SignalDraft[] => {
  const options = props.provisionedConcurrencySpillover;
  if (options === undefined) {
    return [];
  }

  ensureSpilloverResource(options.resource);
  ensurePresentPositiveThreshold(options.threshold);
  const lambdaFunction = props.lambdaFunction;
  if (lambdaFunction === undefined) {
    throw new Error(LAMBDA_FUNCTION_REQUIRED_MESSAGE);
  }

  return [
    provisionedConcurrencySpilloverSignal(
      lambdaFunction,
      resolveSpilloverThreshold(options, props.alarmConfig),
      options.resource,
    ),
  ];
};

/**
 * Validates every configured signal, then returns the drafts to create.
 *
 * Duration is checked first, then concurrent executions, then provisioned concurrency spillover.
 * A failure in any signal throws before {@link applySignals} creates an alarm.
 *
 * @param props Detector properties.
 * @returns Drafts for the configured signals. Empty when none are configured.
 */
const resolveSignals = (props: LambdaSaturationDetectorProps): SignalDraft[] => [
  ...resolveDurationSignals(props),
  ...resolveConcurrentExecutionsSignals(props),
  ...resolveProvisionedConcurrencySpilloverSignals(props),
];

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
 * p95 and p99 Duration alarms that fire as a function nears its timeout.
 *
 * Set at least one ratio. The alarm threshold is the timeout in milliseconds multiplied by that ratio, rounded to the nearest integer.
 */
export interface DurationNearTimeoutOptions {
  /**
   * Function timeout used to compute the alarm threshold.
   */
  readonly timeout: Duration;
  /**
   * Fraction of `timeout` for the p95 Duration alarm.
   *
   * Greater than 0 and at most 1. Omit it to skip the p95 alarm.
   */
  readonly p95Ratio?: number;
  /**
   * Fraction of `timeout` for the p99 Duration alarm.
   *
   * Greater than 0 and at most 1. Omit it to skip the p99 alarm.
   */
  readonly p99Ratio?: number;
}

/**
 * Alarm when ConcurrentExecutions reaches a threshold.
 *
 * The metric is AWS/Lambda ConcurrentExecutions with the FunctionName dimension and the Maximum statistic.
 * `alarmConfig.threshold` does not change this threshold.
 */
export interface ConcurrentExecutionsOptions {
  /**
   * Alarm threshold.
   *
   * Must be a finite number greater than 0.
   */
  readonly threshold: number;
}

/**
 * Alarm when provisioned concurrency invocations spill over.
 *
 * The metric is AWS/Lambda ProvisionedConcurrencySpilloverInvocations with the Sum statistic.
 * Set `resource` to add the Resource dimension next to FunctionName. Omit `threshold` to use
 * {@link LambdaSaturationDetectorProps.alarmConfig}, which defaults to 1.
 */
export interface ProvisionedConcurrencySpilloverOptions {
  /**
   * Resource dimension value, such as an alias or version name.
   *
   * Stored as given. A blank value is rejected. Omit it to watch FunctionName only.
   */
  readonly resource?: string;
  /**
   * Alarm threshold.
   *
   * Must be a finite number greater than 0 when set. Overrides `alarmConfig.threshold`.
   *
   * @default alarmConfig.threshold, or 1
   */
  readonly threshold?: number;
}

/**
 * Properties for {@link LambdaSaturationDetector}.
 */
export interface LambdaSaturationDetectorProps {
  /**
   * Existing SNS topic notified when an alarm enters ALARM.
   *
   * The construct does not create a topic. OK and INSUFFICIENT_DATA do not notify this topic.
   * Omit it to create alarms without an alarm action.
   *
   * @default no topic
   */
  readonly alarmTopic?: ITopic;
  /**
   * Shared alarm settings.
   *
   * `threshold` applies to provisioned concurrency spillover when that signal omits its own threshold.
   * Duration alarms keep their computed threshold, and concurrent executions use
   * {@link ConcurrentExecutionsOptions.threshold}.
   * Period, evaluation periods, and missing-data treatment stay at the detector defaults.
   *
   * @default threshold 1
   */
  readonly alarmConfig?: AlarmConfig;
  /**
   * Function whose metrics are watched.
   *
   * Required when `durationNearTimeout`, `concurrentExecutions`, or `provisionedConcurrencySpillover` is set.
   */
  readonly lambdaFunction?: IFunction;
  /**
   * Alarms when p95 or p99 Duration nears the function timeout.
   *
   * @default no duration alarms
   */
  readonly durationNearTimeout?: DurationNearTimeoutOptions;
  /**
   * Alarm when concurrent executions reach {@link ConcurrentExecutionsOptions.threshold}.
   *
   * @default no concurrent executions alarm
   */
  readonly concurrentExecutions?: ConcurrentExecutionsOptions;
  /**
   * Alarm when provisioned concurrency invocations spill over.
   *
   * @default no provisioned concurrency spillover alarm
   */
  readonly provisionedConcurrencySpillover?: ProvisionedConcurrencySpilloverOptions;
}

/**
 * CloudWatch alarms for configured Lambda saturation signals.
 *
 * Every signal is validated before any alarm is created. With no signals configured,
 * the construct creates no alarms. A topic is notified only when an alarm enters ALARM.
 */
export class LambdaSaturationDetector extends Construct {
  /**
   * SNS topic notified when an alarm enters ALARM.
   *
   * Undefined when no topic was provided. Those alarms have no alarm action.
   */
  public readonly alarmTopic: ITopic | undefined;

  /**
   * @param scope Parent construct.
   * @param id Construct id.
   * @param props Function, signals, and optional alarm topic. The construct does not create a topic.
   */
  constructor(scope: Construct, id: string, props: LambdaSaturationDetectorProps) {
    super(scope, id);

    this.alarmTopic = props.alarmTopic;

    // Validation finishes before any alarm is created, so a signal added later
    // cannot leave a partial set of alarms behind.
    const signals = resolveSignals(props);
    applySignals(this, this.alarmTopic, signals);
  }
}
