# Third-party licenses

`inject-nockta-skills` bundles curated AI-agent skill packs under `packs/`. Some of those
skills are third-party works redistributed verbatim (or lightly adapted) from their upstream
open-source projects. This file provides the attribution and license notices those upstream
licenses require to be shipped with any redistribution.

Scope: this file covers **only** the third-party skills bundled in `packs/`. It does **not**
cover the `inject-nockta-skills` tool itself (Apache-2.0 — see root `LICENSE`/`NOTICE`), the
owner-authored `razor` pack (MIT — see `packs/razor/LICENSE`), the owner-authored `common`
doctrine skills (`paper-trail`, `proof-of-done`, `subagent-delegation`), or the Nockta
clean-room skills `liquid-a11y` and `liquid-theme-standards`.

91 bundled skills across 17 upstream repositories are covered below. Copyright lines and
license texts were taken from each upstream repository's own license artifact (repo-root
LICENSE file, or, where none exists, the repository README / skill frontmatter that declares
the license — noted per entry). Every upstream is permissively licensed (16 MIT, 1
Apache-2.0); no copyleft is bundled.

---

## Summary

| # | Upstream project | Repository | License | Bundled skills |
|---|---|---|---|---|
| 1 | Expo Skills | https://github.com/expo/skills | MIT | 19 |
| 2 | Shopify AI Toolkit | https://github.com/shopify/shopify-ai-toolkit | MIT | 15 |
| 3 | Callstack Agent Skills | https://github.com/callstackincubator/agent-skills | MIT | 8 |
| 4 | mattpocock/skills | https://github.com/mattpocock/skills | MIT | 8 |
| 5 | Vercel Labs Agent Skills | https://github.com/vercel-labs/agent-skills | MIT | 7 |
| 6 | Superpowers | https://github.com/obra/superpowers | MIT | 6 |
| 7 | wshobson/agents | https://github.com/wshobson/agents | MIT | 6 |
| 8 | Nx AI Agents Config | https://github.com/nrwl/nx-ai-agents-config | MIT | 6 |
| 9 | Weaverse Hydrogen Skills | https://github.com/weaverse/shopify-hydrogen-skills | MIT | 4 |
| 10 | Next.js | https://github.com/vercel/next.js | MIT | 3 |
| 11 | Software Mansion Skills | https://github.com/software-mansion-labs/skills | MIT | 3 |
| 12 | Turborepo | https://github.com/vercel/turborepo | MIT | 1 |
| 13 | Hookdeck Webhook Skills | https://github.com/hookdeck/webhook-skills | MIT | 1 |
| 14 | jeffallan/claude-skills | https://github.com/jeffallan/claude-skills | MIT | 1 |
| 15 | kadajett/agent-nestjs-skills | https://github.com/kadajett/agent-nestjs-skills | MIT | 1 |
| 16 | antfu/skills | https://github.com/antfu/skills | MIT | 1 |
| 17 | Anthropic Skills | https://github.com/anthropics/skills | Apache-2.0 | 1 |
| | | | **Total** | **91** |

---

## 1. Expo Skills

- **Project:** Expo Skills
- **Repository:** https://github.com/expo/skills
- **License:** MIT
- **Copyright:** Copyright (c) 2025-present 650 Industries, Inc. (aka Expo)
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (19):** `expo/eas-app-stores`, `expo/eas-hosting`, `expo/eas-observe`,
  `expo/eas-simulator`, `expo/eas-update-insights`, `expo/eas-workflows`, `expo/expo-app-clip`,
  `expo/expo-brownfield`, `expo/expo-data-fetching`, `expo/expo-dev-client`, `expo/expo-dom`,
  `expo/expo-examples`, `expo/expo-module`, `expo/expo-native-ui`, `expo/expo-router`,
  `expo/expo-tailwind-setup`, `expo/expo-ui`, `expo/expo-upgrade`, `expo/expo-web-to-native`.

```
MIT License

Copyright (c) 2025-present 650 Industries, Inc. (aka Expo)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Shopify AI Toolkit

- **Project:** Shopify AI Toolkit
- **Repository:** https://github.com/shopify/shopify-ai-toolkit
- **License:** MIT
- **Copyright:** Copyright 2025-present, Shopify Inc.
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (15):** `shopify-app/shopify-admin`, `shopify-app/shopify-app-store-review`,
  `shopify-app/shopify-custom-data`, `shopify-app/shopify-customer`, `shopify-app/shopify-functions`,
  `shopify-app/shopify-partner`, `shopify-app/shopify-payments-apps`,
  `shopify-app/shopify-polaris-admin-extensions`, `shopify-app/shopify-polaris-app-home`,
  `shopify-app/shopify-polaris-checkout-extensions`,
  `shopify-app/shopify-polaris-customer-account-extensions`, `shopify-app/shopify-use-shopify-cli`,
  `shopify-headless/shopify-hydrogen`, `shopify-headless/shopify-storefront-graphql`,
  `shopify-theme/shopify-liquid`.

```
MIT License

Copyright 2025-present, Shopify Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Callstack Agent Skills

- **Project:** Callstack Agent Skills
- **Repository:** https://github.com/callstackincubator/agent-skills
- **License:** MIT
- **Copyright:** Copyright (c) 2026 Callstack Incubator
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (8):** `react-native/callstack-assess-react-native-migration`,
  `react-native/callstack-create-react-native-library`, `react-native/callstack-github-actions`,
  `react-native/callstack-react-native-best-practices`,
  `react-native/callstack-react-native-brownfield-migration`,
  `react-native/callstack-react-native-tv-best-practices`, `react-native/callstack-react-navigation`,
  `react-native/callstack-upgrading-react-native`.

```
MIT License

Copyright (c) 2026 Callstack Incubator

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 4. mattpocock/skills

- **Project:** mattpocock/skills
- **Repository:** https://github.com/mattpocock/skills
- **License:** MIT
- **Copyright:** Copyright (c) 2026 Matt Pocock
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (8):** `common/codebase-design`, `common/code-review`, `common/diagnosing-bugs`,
  `common/domain-modeling`, `common/grilling`, `common/grill-me`,
  `common/improve-codebase-architecture`, `common/tdd`.

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 5. Vercel Labs Agent Skills

- **Project:** Vercel Labs Agent Skills
- **Repository:** https://github.com/vercel-labs/agent-skills
- **License:** MIT
- **Copyright:** No formal copyright notice exists upstream (no repo-root LICENSE file).
  Attributed to Vercel Labs / vercel-labs.
- **Evidence:** MIT is declared in each bundled skill's own `SKILL.md` YAML frontmatter
  (`license: MIT`); the repository ships no standalone LICENSE file (repo-root `LICENSE`
  returns HTTP 404). The MIT permission text below is the standard MIT text; because upstream
  supplies no copyright line, none is asserted here beyond the attribution above.
- **Bundled skills (7):** `next/composition-patterns`, `next/react-best-practices`,
  `next/react-view-transitions`, `react-native/react-native-skills`,
  `vite-react-ts/composition-patterns`, `vite-react-ts/react-best-practices`,
  `vite-react-ts/react-view-transitions`.

```
MIT License

Copyright (c) Vercel Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 6. Superpowers

- **Project:** Superpowers (obra/superpowers)
- **Repository:** https://github.com/obra/superpowers
- **License:** MIT
- **Copyright:** Copyright (c) 2025 Jesse Vincent
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (6):** `common/brainstorming`, `common/finishing-a-development-branch`,
  `common/receiving-code-review`, `common/requesting-code-review`, `common/using-git-worktrees`,
  `common/writing-plans`.

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 7. wshobson/agents

- **Project:** wshobson/agents
- **Repository:** https://github.com/wshobson/agents
- **License:** MIT
- **Copyright:** Copyright (c) 2024 Seth Hobson
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (6):** `monorepo/monorepo-management`, `monorepo/nx-workspace-patterns`,
  `monorepo/turborepo-caching`, `next/nextjs-app-router-patterns`,
  `react-native/wshobson-react-native-architecture`, `react-native/wshobson-react-native-design`.

```
MIT License

Copyright (c) 2024 Seth Hobson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 8. Nx AI Agents Config

- **Project:** Nx AI Agents Config
- **Repository:** https://github.com/nrwl/nx-ai-agents-config
- **License:** MIT
- **Copyright:** Copyright (c) 2017-2026 Narwhal Technologies Inc.
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (6):** `monorepo/link-workspace-packages`, `monorepo/nx-generate`,
  `monorepo/nx-import`, `monorepo/nx-plugins`, `monorepo/nx-run-tasks`, `monorepo/nx-workspace`.

```
MIT License

Copyright (c) 2017-2026 Narwhal Technologies Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 9. Weaverse Hydrogen Skills

- **Project:** Weaverse Hydrogen Skills
- **Repository:** https://github.com/weaverse/shopify-hydrogen-skills
- **License:** MIT
- **Copyright:** No formal copyright notice exists upstream (no repo-root LICENSE file).
  Attributed to Weaverse (https://weaverse.io).
- **Evidence:** the repository README `## License` section reads verbatim:
  `MIT — [Weaverse](https://weaverse.io)`. No standalone LICENSE file and no `license:` key in
  the skills' frontmatter; the README declaration is the sole evidence.
- **Bundled skills (4):** `shopify-headless/weaverse-hydrogen-cookbooks`,
  `shopify-headless/weaverse-hydrogen-upgrades`, `shopify-headless/weaverse-shopify-hydrogen`,
  `shopify-headless/weaverse-theme-update`.

```
MIT License

Copyright (c) Weaverse (https://weaverse.io)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 10. Next.js

- **Project:** Next.js
- **Repository:** https://github.com/vercel/next.js
- **License:** MIT
- **Copyright:** Copyright (c) 2025 Vercel, Inc.
- **Evidence:** repo-root `license.md` file.
- **Bundled skills (3):** `next/next-cache-components-adoption`,
  `next/next-cache-components-optimizer`, `next/next-dev-loop`.

```
MIT License

Copyright (c) 2025 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 11. Software Mansion Skills

- **Project:** Software Mansion Skills
- **Repository:** https://github.com/software-mansion-labs/skills
- **License:** MIT
- **Copyright:** No formal copyright notice exists upstream (no repo-root LICENSE file).
  Attributed to Software Mansion.
- **Evidence:** the repository README declares `MIT` in its License section, and each bundled
  skill's `SKILL.md` frontmatter declares `license: MIT` (radon-mcp is evidenced at repo/README
  level only). No standalone LICENSE file exists (repo-root `LICENSE` returns HTTP 404).
- **Bundled skills (3):** `react-native/swm-radon-mcp`,
  `react-native/swm-react-native-best-practices`, `react-native/swm-rnrepo`.

```
MIT License

Copyright (c) Software Mansion

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 12. Turborepo

- **Project:** Turborepo
- **Repository:** https://github.com/vercel/turborepo
- **License:** MIT
- **Copyright:** Copyright (c) 2026 Vercel, Inc.
- **Evidence:** repo-root `LICENSE` file.
- **Bundled skills (1):** `monorepo/turborepo`.

```
MIT License

Copyright (c) 2026 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 13. Hookdeck Webhook Skills

- **Project:** Hookdeck Webhook Skills
- **Repository:** https://github.com/hookdeck/webhook-skills
- **License:** MIT
- **Copyright:** Copyright (c) 2026 Hookdeck
- **Evidence:** repo-root `LICENSE` file (and the skill's `SKILL.md` frontmatter, both agree).
- **Bundled skills (1):** `shopify-app/shopify-webhooks`.

```
MIT License

Copyright (c) 2026 Hookdeck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 14. jeffallan/claude-skills

- **Project:** jeffallan/claude-skills
- **Repository:** https://github.com/jeffallan/claude-skills
- **License:** MIT
- **Copyright:** Copyright (c) 2025
- **Evidence:** repo-root `LICENSE` file (and the skill's `SKILL.md` frontmatter, both agree).
- **Bundled skills (1):** `nest/nestjs-expert`.

```
MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 15. kadajett/agent-nestjs-skills

- **Project:** kadajett/agent-nestjs-skills
- **Repository:** https://github.com/kadajett/agent-nestjs-skills
- **License:** MIT
- **Copyright:** No formal copyright notice exists upstream (no repo-root LICENSE file; GitHub
  API reports `license: null`). Attributed to the repository author (kadajett).
- **Evidence:** MIT is declared solely in the bundled skill's own `SKILL.md` YAML frontmatter
  (`license: MIT`). No standalone LICENSE file exists (repo-root `LICENSE` returns HTTP 404) and
  the README carries no license mention; the frontmatter self-declaration is the only evidence.
- **Bundled skills (1):** `nest/nestjs-best-practices`.

```
MIT License

Copyright (c) kadajett (agent-nestjs-skills)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 16. antfu/skills

- **Project:** antfu/skills
- **Repository:** https://github.com/antfu/skills
- **License:** MIT
- **Copyright:** Copyright (c) 2025-PRESENT Anthony Fu <https://github.com/antfu>
- **Evidence:** repo-root `LICENSE.md` file (web-verified against the upstream repository; the
  bundled `vite` skill's `SKILL.md` metadata also records `author: Anthony Fu` and
  `source: https://github.com/antfu/skills`).
- **Bundled skills (1):** `vite-react-ts/vite`.

```
MIT License

Copyright (c) 2025-PRESENT Anthony Fu <https://github.com/antfu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 17. Anthropic Skills

- **Project:** Anthropic Skills
- **Repository:** https://github.com/anthropics/skills
- **License:** Apache License 2.0
- **Copyright:** Copyright 2026 Anthropic, PBC.
- **Evidence:** per-skill `LICENSE.txt` (Apache-2.0), which ships bundled inside the skill at
  `packs/common/skills/webapp-testing/LICENSE.txt` and is retained as-is.
- **NOTICE:** Apache-2.0 §4(d) requires propagating a NOTICE file only if the original work
  distributes one. The upstream `anthropics/skills` repository was web-verified (2026-07-13):
  it carries **no** `NOTICE`/`NOTICE.txt`/`NOTICE.md` file at any level (the webapp-testing skill
  directory ships no NOTICE either). It does carry a `THIRD_PARTY_NOTICES.md` documenting the
  repo's own dependencies, which is not an Apache §4(d) attribution NOTICE for this Work. There is
  therefore no NOTICE to propagate. Apache §4(a)/(c) attribution is satisfied by the retained
  `LICENSE.txt`.
- **Bundled skills (1):** `common/webapp-testing`.

The full Apache License 2.0 text (as shipped in `packs/common/skills/webapp-testing/LICENSE.txt`):

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2026 Anthropic, PBC.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

---

_Generated 2026-07-13 as part of the packs redistribution audit remediation (RED-2, YELLOW-1/2/3).
Reconciliation: 91 third-party skill directories on disk in `packs/` map to the 17 upstream
entries above (verified against `planned skills/**/PROVENANCE.md` and the shipped `packs/`
tree). If skills are added, removed, or re-provenanced, regenerate this file._
