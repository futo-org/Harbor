# FUTO Moderation Service

This servers listens for content pushed to FUTO managed polycentric servers and labels 'content'. Other Polycentric servers can subscribe to our labelling feed by polling for new events. We may introduce a streaming option in the future.

Likewise, you can also run this service yourself if you wish.

## Environment Variables

All service variables are read and validated once at startup by
`src/config.rs`. A `.env` file in the working directory is loaded first.

| Variable | Default | Description |
|---|---|---|
| `HARBOR_DATABASE_URL` | `postgres://postgres:testing@localhost:5432` | Postgres connection URL. |
| `HARBOR_DATABASE_MAX_CONNECTIONS` | `20` | Maximum size of the Postgres connection pool. |
| `HARBOR_MODERATION_DATABASE_SCHEMA` | `moderation` | Postgres schema owning this service's tables. |
| `HARBOR_MODERATION_SIGNING_KEY` | _(required)_ | Hex-encoded 32-byte ed25519 seed labels events are signed with. |
| `HARBOR_MODERATION_IDENTITY` | _(required)_ | Hex identity string this service publishes under. |
| `HARBOR_MODERATION_SERVERS` | _(required)_ | Comma-separated gRPC server URLs to bootstrap from and publish to. |
| `HARBOR_AZURE_CONTENT_SAFETY_KEY` | _(unset)_ | Azure AI Content Safety API key. Unset disables content scoring; must be set together with the previous variable. |
| `HARBOR_AZURE_CONTENT_SAFETY_ENDPOINT` | _(unset)_ | Azure AI Content Safety resource endpoint. Unset disables content scoring; must be set together with the following variable. |
| `HARBOR_AZURE_CONTENT_SAFETY_API_VERSION` | `2024-09-01` | api-version for the text/image endpoints. |
| `HARBOR_AZURE_CONTENT_SAFETY_MULTIMODAL_API_VERSION` | `2024-09-15-preview` | api-version for the multimodal (`imageWithText`) endpoint. |
| `HARBOR_PHOTODNA_KEY` | _(unset)_ | PhotoDNA subscription key. Unset disables CSAM scanning and the service moderates with Azure alone. |
| `HARBOR_PHOTODNA_ENDPOINT` | `https://api.microsoftmoderator.com/photodna/v1.0` | PhotoDNA endpoint. |

Additionally various shared variables are read, see the table in
[`services/server/README.md`](../server/README.md#common-environment-variables).

## Moderator labels

Besides automated scoring, the service publishes the label decisions
moderators make in the app. The server authenticates the moderator
(`ModerationService.SetLabels`, checked against its `moderator` table) and
produces a `LabelRequest` to the `label-requests` Kafka topic; this service
consumes it and publishes a `Labels` event with the requested label values,
signed by its own identity. A newer `Labels` event replaces an older one on
the same post, so a decision can also clear labels or override automated
scoring. See the "Our Labels and Azure AI Content Safety Ratings" section
below for details on labels.

## Local development

The service needs an identity, and the server must already have that identity's event
chain. To ensure this is configured correctly, use the script in this directory as
follows:

```sh
docker compose up -d --build server
./services/moderation/create-local-identity.sh
docker compose up -d --build server   # picks up HARBOR_MODERATION_IDENTITY
docker compose --profile moderation up -d --build moderation
```

The script writes `HARBOR_MODERATION_IDENTITY` and
`HARBOR_MODERATION_SIGNING_KEY` into the repository-root `.env`, which
`compose.yml` reads. The server restart is required to read the newly created
identity.

## Tests

Tests below are `#[ignore]`d by `cargo test` because they require Docker
infrastructure or secrets. They can be run as follows:

```sh
.gitlab/ci/scripts/integration-moderation.sh
```

### CSAM pipeline, end-to-end

`tests/csam_pipeline.rs` publishes a post with an image to the server which
is consumed by an instance of the moderation service, and flagged by a mock
PhotoDNA server connected via `HARBOR_PHOTODNA_ENDPOINT`. It asserts the
match purges the image and publishes a `CHILD_SAFETY` report.

### PhotoDNA real-API match

`photodna_real_api_reports_match` (in `src/providers/photodna.rs`) sends a
PhotoDNA-provided test image to the real `Match` endpoint and asserts a match.
Supply the key and image via the environment.

```sh
HARBOR_PHOTODNA_KEY=<subscription key> \
HARBOR_PHOTODNA_TEST_IMAGES=/absolute/path/to/image/directory \
  cargo test -p moderation-service photodna_real_api_reports_match -- --ignored --nocapture
```

## Our Labels and Azure AI Content Safety Ratings

The service delegates content analysis to
[Azure AI Content Safety](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/).
Azure scores content across four categories: Hate, Sexual, Violence, and SelfHarm. Each category
score may range from 0-6 in severity. The moderation service maps those ratings to the labels below.

| Polycentric label | Azure category | Azure severity range |
|---|---|---|
| `hate` | Hate | 4–6 |
| `self-harm` | SelfHarm | 4–6 |
| `sexually-suggestive` | Sexual | 2–4 |
| `sexually-explicit` | Sexual | 5–6 |
| `violence` | Violence | 4–6 |

### Azure categories
Azure defines each category as follows:

**Hate**: Content that attacks or uses discriminatory language with reference to a
person or identity group based on race, ethnicity, nationality, gender identity and
expression, sexual orientation, religion, personal appearance, disability status, or
similar attributes. Includes harassment and bullying.

**Sexual**: Language related to anatomical organs and genitals, romantic relationships
and sexual acts, erotic or affectionate portrayals, nudity and pornography, prostitution,
abuse, and child exploitation or grooming.

**Violence**: Language related to physical actions intended to hurt, injure, damage, or
kill someone or something; weapons, guns, and related entities; bullying, intimidation,
terrorist and violent extremism, and stalking.

**SelfHarm**: Language related to physical actions intended to purposely hurt, injure,
damage one's body, or kill oneself; includes eating disorders and bullying.

See [Harm categories in Azure AI Content Safety](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/harm-categories)
for more details.
