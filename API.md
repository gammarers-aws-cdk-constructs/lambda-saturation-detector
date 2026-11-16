# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### LambdaSaturationDetector <a name="LambdaSaturationDetector" id="lambda-saturation-detector.LambdaSaturationDetector"></a>

CloudWatch alarms for configured Lambda saturation signals.

Every signal is validated before any alarm is created. With no signals configured,
the construct creates no alarms. The topic is notified only when an alarm enters ALARM.

#### Initializers <a name="Initializers" id="lambda-saturation-detector.LambdaSaturationDetector.Initializer"></a>

```typescript
import { LambdaSaturationDetector } from 'lambda-saturation-detector'

new LambdaSaturationDetector(scope: Construct, id: string, props: LambdaSaturationDetectorProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | Parent construct. |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.Initializer.parameter.id">id</a></code> | <code>string</code> | Construct id. |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.Initializer.parameter.props">props</a></code> | <code><a href="#lambda-saturation-detector.LambdaSaturationDetectorProps">LambdaSaturationDetectorProps</a></code> | Alarm topic. |

---

##### `scope`<sup>Required</sup> <a name="scope" id="lambda-saturation-detector.LambdaSaturationDetector.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

Parent construct.

---

##### `id`<sup>Required</sup> <a name="id" id="lambda-saturation-detector.LambdaSaturationDetector.Initializer.parameter.id"></a>

- *Type:* string

Construct id.

---

##### `props`<sup>Required</sup> <a name="props" id="lambda-saturation-detector.LambdaSaturationDetector.Initializer.parameter.props"></a>

- *Type:* <a href="#lambda-saturation-detector.LambdaSaturationDetectorProps">LambdaSaturationDetectorProps</a>

Alarm topic.

The construct does not create a topic.

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="lambda-saturation-detector.LambdaSaturationDetector.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="lambda-saturation-detector.LambdaSaturationDetector.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="lambda-saturation-detector.LambdaSaturationDetector.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="lambda-saturation-detector.LambdaSaturationDetector.isConstruct"></a>

```typescript
import { LambdaSaturationDetector } from 'lambda-saturation-detector'

LambdaSaturationDetector.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="lambda-saturation-detector.LambdaSaturationDetector.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetector.property.alarmTopic">alarmTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | SNS topic notified when an alarm enters ALARM. |

---

##### `node`<sup>Required</sup> <a name="node" id="lambda-saturation-detector.LambdaSaturationDetector.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `alarmTopic`<sup>Required</sup> <a name="alarmTopic" id="lambda-saturation-detector.LambdaSaturationDetector.property.alarmTopic"></a>

```typescript
public readonly alarmTopic: ITopic;
```

- *Type:* aws-cdk-lib.aws_sns.ITopic

SNS topic notified when an alarm enters ALARM.

---


## Structs <a name="Structs" id="Structs"></a>

### AlarmConfig <a name="AlarmConfig" id="lambda-saturation-detector.AlarmConfig"></a>

Optional overrides for a saturation alarm.

Omitted fields use threshold 1, a 5 minute period, 1 evaluation period,
and treat missing data as not breaching.

#### Initializer <a name="Initializer" id="lambda-saturation-detector.AlarmConfig.Initializer"></a>

```typescript
import { AlarmConfig } from 'lambda-saturation-detector'

const alarmConfig: AlarmConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#lambda-saturation-detector.AlarmConfig.property.evaluationPeriods">evaluationPeriods</a></code> | <code>number</code> | Number of periods to evaluate. |
| <code><a href="#lambda-saturation-detector.AlarmConfig.property.period">period</a></code> | <code>aws-cdk-lib.Duration</code> | Metric period. |
| <code><a href="#lambda-saturation-detector.AlarmConfig.property.threshold">threshold</a></code> | <code>number</code> | Alarm threshold. |
| <code><a href="#lambda-saturation-detector.AlarmConfig.property.treatMissingData">treatMissingData</a></code> | <code>aws-cdk-lib.aws_cloudwatch.TreatMissingData</code> | How to treat missing data. |

---

##### `evaluationPeriods`<sup>Optional</sup> <a name="evaluationPeriods" id="lambda-saturation-detector.AlarmConfig.property.evaluationPeriods"></a>

```typescript
public readonly evaluationPeriods: number;
```

- *Type:* number
- *Default:* 1

Number of periods to evaluate.

---

##### `period`<sup>Optional</sup> <a name="period" id="lambda-saturation-detector.AlarmConfig.property.period"></a>

```typescript
public readonly period: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.minutes(5)

Metric period.

---

##### `threshold`<sup>Optional</sup> <a name="threshold" id="lambda-saturation-detector.AlarmConfig.property.threshold"></a>

```typescript
public readonly threshold: number;
```

- *Type:* number
- *Default:* 1

Alarm threshold.

---

##### `treatMissingData`<sup>Optional</sup> <a name="treatMissingData" id="lambda-saturation-detector.AlarmConfig.property.treatMissingData"></a>

```typescript
public readonly treatMissingData: TreatMissingData;
```

- *Type:* aws-cdk-lib.aws_cloudwatch.TreatMissingData
- *Default:* TreatMissingData.NOT_BREACHING

How to treat missing data.

---

### LambdaSaturationDetectorProps <a name="LambdaSaturationDetectorProps" id="lambda-saturation-detector.LambdaSaturationDetectorProps"></a>

Properties for {@link LambdaSaturationDetector}.

#### Initializer <a name="Initializer" id="lambda-saturation-detector.LambdaSaturationDetectorProps.Initializer"></a>

```typescript
import { LambdaSaturationDetectorProps } from 'lambda-saturation-detector'

const lambdaSaturationDetectorProps: LambdaSaturationDetectorProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#lambda-saturation-detector.LambdaSaturationDetectorProps.property.alarmTopic">alarmTopic</a></code> | <code>aws-cdk-lib.aws_sns.ITopic</code> | Existing SNS topic notified when an alarm enters ALARM. |

---

##### `alarmTopic`<sup>Required</sup> <a name="alarmTopic" id="lambda-saturation-detector.LambdaSaturationDetectorProps.property.alarmTopic"></a>

```typescript
public readonly alarmTopic: ITopic;
```

- *Type:* aws-cdk-lib.aws_sns.ITopic

Existing SNS topic notified when an alarm enters ALARM.

The construct does not create a topic. OK and INSUFFICIENT_DATA do not notify this topic.

---



