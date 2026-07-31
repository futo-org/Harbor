# FUTO Moderation Service

This servers listens for content pushed to FUTO managed polycentric servers and labels 'content'. Other Polycentric servers can subscribe to our labelling feed by polling for new events. We may introduce a streaming option in the future.

Likewise, you can also run this service yourself if you wish.

## Tests

Both tests below are `#[ignore]`d by `cargo test` because they require Docker
infrastructure or secrets.

### CSAM pipeline, end-to-end

`tests/csam_pipeline.rs` publishes a post with an image to the server which
is consumed by an instance of the moderation service, and flagged by a mock
PhotoDNA server connected via `POLYCENTRIC_PHOTODNA_ENDPOINT`. It asserts the
match purges the image and publishes a `CHILD_SAFETY` report. Run it with the
following:

```sh
.gitlab/ci/scripts/integration-moderation.sh
```

### PhotoDNA real-API match

`photodna_real_api_reports_match` (in `src/providers/photodna.rs`) sends a
PhotoDNA-provided test image to the real `Match` endpoint and asserts a match.
Supply the key and image via the environment.

```sh
POLYCENTRIC_PHOTODNA_KEY=<subscription key> \
POLYCENTRIC_PHOTODNA_TEST_IMAGES=/absolute/path/to/image/directory \
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
