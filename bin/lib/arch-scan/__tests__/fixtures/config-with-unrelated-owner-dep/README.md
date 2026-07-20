# config-with-unrelated-owner-dep (mixed ownership fixture)

Regression fixture for `config-vs-dependency-presence`.

- `prettier` config has its owning `prettier` dependency.
- `knip` config has no `knip` dependency.
- The scanner must emit only the `knip` ownership finding; an unrelated
  counterpart must not satisfy every config trigger.
