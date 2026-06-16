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
