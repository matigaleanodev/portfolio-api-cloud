# Costs: scenarios, not a confirmed budget

[Español](costs.es.md) · Consulted 2026-10-24. USD/month, us-east-1, before taxes/ARS conversion. [Sources](sources.md).

## Explicit workload model

These calculations cover the candidate Lambda **Event Function**, not native Web Functions. Figures use hypothetical traffic rather than measured traffic or personal billing. The model compares alternatives without guaranteeing savings.

| Monthly assumption | Low | Higher use |
| --- | --- | --- |
| Total requests N | 10,000 | 1,000,000 |
| Chat calling provider | 20% = 2,000 | 20% = 200,000 |
| Chat/other duration | 5 s / 0.15 s | 5 s / 0.15 s |
| Weighted mean duration | 1.12 s | 1.12 s |
| x86 memory | 512 MiB | 512 MiB |
| GB-s = N × 0.5 × 1.12 | 5,600 | 560,000 |
| Total logs/request | 2 KiB | 2 KiB |
| Total outbound HTTP/provider data | 7 KiB/request | 7 KiB/request |
| Grouped secret reads/month | 100 | 10,000 |

Five seconds includes external waiting and is not a measured p95. Each additional average second costs N×0.5×0.0000166667; at 1 M requests that is ~USD 8.33 before benefits. Compare 1024 MiB: twice the per-second cost may be offset by shorter duration/cold starts. Include billed INIT and secret refresh in measurements.

## Candidate components without discounts

Reference rates: x86 Lambda 0.0000166667/GB-s and 0.20/M requests, HTTP API 1/M, standard logs 0.50/GB ingestion and 0.03/GB-month storage, four standard alarms at 0.10. One JSON secret at 0.40/month, 0.05/10,000 reads. Limiter assumes up to two nontransactional WRUs and two RRUs per request, small items, 0.625/M WRU and 0.125/M RRU. Recalculate for the final algorithm, failed conditions and transactional operations.

| Component | Low | Higher use |
| --- | ---: | ---: |
| Lambda compute | 0.093 | 9.333 |
| Lambda requests | 0.002 | 0.200 |
| HTTP API | 0.010 | 1.000 |
| DynamoDB limiter requests | 0.015 | 1.500 |
| Counter-storage allowance | 0.010 | 0.010 |
| Grouped secret + reads | 0.401 | 0.450 |
| Log ingestion + conservative 14-day storage | 0.010 | 0.981 |
| Four alarms | 0.400 | 0.400 |
| Deployment S3 assets/requests allowance | 0.050 | 0.100 |
| Internet egress at 0.09/GB without allowance | 0.006 | 0.601 |
| **Approximate candidate subtotal** | **1.00** | **14.58** |

Official rates: [Lambda](https://aws.amazon.com/lambda/pricing/), [HTTP API](https://aws.amazon.com/api-gateway/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [secrets](https://aws.amazon.com/secrets-manager/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/).

No application database, NAT, ALB, VPC endpoints, Redis, queues, provisioned concurrency or extra /tmp storage is included. Native metrics initially; Logs Insights queries, X-Ray, dashboards or further telemetry would add charges. Assets depend on package retention. R2 and existing subscription upstream costs are separate below.

**Separate free-benefit scenario:** if the account's entire shared Lambda benefit of 1 M requests/400,000 GB-s remains available and applicable, Lambda becomes zero for low traffic and ~2.667 for higher use. Keeping all other charges undiscounted gives ~**0.90** and **7.71**. No API Gateway promotions, welcome credits, CloudWatch/DynamoDB allowances or free transfer are deducted; eligibility/shared use was not verified. Do not allocate the whole benefit independently to every repo/stage.

OpenAI waiting time creates Lambda duration charges in addition to token charges. Process-local AI cache may have fewer hits after scaling; measure the assumed 20% provider-call ratio.

## External services and shared responsibilities

Official gpt-4.1-mini model docs list 0.40/M input tokens, 0.10/M cached input and 1.60/M output. At 1,000 uncached input + 200 output tokens, one call costs 0.00072: **USD 1.44** or **144** for 2,000/200,000 calls. The actual production model override is unverified. No free calls/cache/tool use assumed. [Model/pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Resend contact/newsletters, R2 knowledge/media/subscribers, Firebase, domain and portfolio-cloud **continue**. Their plans/bills were not audited and are not treated as zero. Each subscription still creates cloud HTTP/Lambda/R2 usage. The new API needs artifact reads, not duplicated publication/storage. Release idempotency remains cloud-owned.

CDK/SAM add no framework license fee. Public GitHub does not prove unlimited Actions/storage/auxiliary use; measure builds/retention. Optional Serverless Dashboard/SST Console are excluded. Tool license cost differs from AWS operating cost.

## Shared EC2 and coexistence

Observed live: t3.micro, one public IPv4, 8 GiB root EBS; volume class unverified. Linux On-Demand reference: 730 h×0.0104 = **7.59**, IPv4 730×0.005 = **3.65**. EBS is separate; if gp3 at 0.08/GB-month, 8 GiB adds ~0.64, totaling ~**11.88**, excluding Unlimited CPU credits, snapshots, transfer, discounts/taxes. This is a list-price example, not the bill. [T3](https://aws.amazon.com/ec2/instance-types/t3/), [IPv4](https://aws.amazon.com/vpc/pricing/), [EBS](https://aws.amazon.com/ebs/pricing/).

While EC2 runs, fixed savings from Portfolio alone are **zero**. Incremental cost is the new test/production footprint plus measurement and temporary duplication. An idle test stage can still incur secrets/stored-log charges. Two stacks duplicate fixed components and share allowances.

After eventual EC2 retirement, ecosystem cost includes all three migrated APIs, cloud/providers, observability and retained EBS/snapshots. Do not allocate the whole EC2 cost to Portfolio or claim net savings before Foodly Notes/Modo Playa are costed. Stopping EC2 retains EBS charges; its autoassigned IPv4 may change on restart. Tunnel avoids using that IP as public DNS origin, but egress/SSM/Docker recovery still needs testing.

Container reference: App Runner lists 0.007/GB-hour provisioned memory and 0.064/vCPU-hour active in this region. Just 1 GiB continuously provisioned is ~5.11/month before CPU/logs; this is not a capacity or eligibility claim. Fargate+ALB adds continuous compute/load-balancing/network costs. Measure before selecting either.

## Missing inputs and effect-free measurement

1. Existing aggregate 30-day route/status/duration access logs, without bodies/emails or generated business traffic.
2. Aggregate chat_provider outcomes/tokens/cache_hit against chat_reply, not just source=faq; do not retrieve prompts/replies.
3. Compare the model with aggregate regional service costs. Actual billing, credits and personal budgets remain in the private record.
4. Isolated cold/warm/INIT/billed duration/memory/token/rejection/counter measurements. Mock providers first; paid calls only with a defined budget.
5. Asset/log/secret retention metadata and external plan information, without GetSecretValue or private subscriber reads.

Agree USD alerts, daily AI quota, ingress controls and operational cutoff before public enablement. Alerts may arrive late and do not impose a spending cap.
