import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  type CfnAlarm,
  ComparisonOperator,
  type IMetric,
  Metric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import type { Construct } from 'constructs';

export const ALARM_PREFIX = 'portfolio-api-cloud-test-';

/**
 * Tres alarmas dentro de la capa gratuita de CloudWatch (10 métricas de alarma por cuenta).
 * Las de cuenta (Throttles y Errors de AWS/Lambda sin dimensión) cubren todas las funciones de
 * la cuenta y son compartidas: los demás proyectos no deben duplicarlas.
 */
export function essentialAlarms(scope: Construct, actions: string[], httpFailures: IMetric) {
  const period = Duration.minutes(5);
  const add = (
    id: string,
    name: string,
    metric: IMetric,
    evaluationPeriods: number,
    datapoints: number,
  ) => {
    const alarm = new Alarm(scope, id, {
      alarmName: `${ALARM_PREFIX}${name}`,
      metric,
      threshold: 1,
      evaluationPeriods,
      datapointsToAlarm: datapoints,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    (alarm.node.defaultChild as CfnAlarm).alarmActions = actions;
    return alarm;
  };
  const account = (metricName: string) =>
    new Metric({ namespace: 'AWS/Lambda', metricName, statistic: 'Sum', period });
  // Una sola métrica personalizada sin dimensiones, publicada por los log groups de api y chat.
  add('HttpServerFailuresAlarm', 'http-errors', httpFailures, 3, 2);
  add('AccountThrottlesAlarm', 'account-throttles', account('Throttles'), 3, 2);
  // El handler HTTP no relanza: Errors refleja crash, timeout u OOM de cualquier función.
  add('AccountErrorsAlarm', 'account-errors', account('Errors'), 1, 1);
}
