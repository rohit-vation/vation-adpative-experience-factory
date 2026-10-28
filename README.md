# Adaptive Experience Factory

A demo workspace for building, governing and optimizing modular digital experiences across AEM, Edge Delivery Services, Contentful and Optimizely.

This is a prototype. It runs in two modes:

- **Demo mode** (no key): every result is hardcoded sample data.
- **AI mode** (Gemini key in `.env`): results come from Gemini and are cleaned into the same screens.

## Run it

You need Node 18 or newer. There is nothing to install.

```
npm start        # http://localhost:3000  (demo mode, or AI mode if a key is set)
npm test         # all checks, no key and no internet needed
```

Open the app through `npm start`. Browsers will not load ES modules from a `file://` address, so double-clicking `index.html` shows a blank page.

## Connecting Gemini

1. Create an API key in Google AI Studio (aistudio.google.com).
2. Copy `.env.example` to `.env` and paste the key:
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Check the model name. In AI Studio, find the exact name of the model you want and set `GEMINI_MODEL` in `.env`. The default in `.env.example` is the name Google's docs used when this project was built.
4. Run `npm start`. The terminal should say `AI: Gemini (...)` and the page header should show **AI: Gemini**.
5. Open **Create component** and press Generate. It can take 30 to 90 seconds because it writes code for four CMS platforms.

The key stays in `.env` on the server. It is never sent to the browser, and `.env` is not served as a web file. Never commit `.env` or paste the key in chat.

### If something goes wrong

| What you see | Meaning and fix |
| --- | --- |
| Header says **AI: off** | The server has no key. Check `.env` is in the project root and the line is `GEMINI_API_KEY=...`, then restart. |
| "Gemini rejected the API key" | Wrong or disabled key. Create a new one in AI Studio. |
| "Gemini does not know the model" | Set `GEMINI_MODEL` to a name listed in AI Studio. |
| "rate limit or quota" | Free-tier limits. Wait a minute, or use a smaller model. |
| "The AI answer was incomplete" | The model's reply failed validation twice. Try again, or use a stronger model. The server log shows why. |
| Any other API error | Set `GEMINI_API_STYLE=interactions` in `.env` and restart. Google's newer docs use that style, and the server also tries it automatically after a 404. |

**Not yet verified against Google's live API.** The request code was tested against a mock that imitates Gemini's response format (`npm test`), not against Google itself. Your first real run is the final check. If Google's API differs from what is written, only `server/gemini.js` needs changing.

### What the AI can and cannot do per workflow

| Workflow | Quality of live result |
| --- | --- |
| Create component | Real. Generated from your description. |
| Prepare personalization blocks | Real. Check the metadata against the import format of your personalization system. |
| Map components | Partly. The model only gets component names, so the source code is a plausible example. Results show a notice. |
| Audit experience | Estimates only. The model cannot open the site or measure anything. Results show a notice. |
| Migrate content | Estimates only. The model cannot crawl the site. Results show a notice. |

Making Audit and Migrate real needs tools that fetch and measure (Lighthouse, axe-core, a crawler). Those would go in `server/` and their results would be passed into the prompt.

## The five workflows

| Workflow | You enter | You get |
| --- | --- | --- |
| Create component | name, CMS, description | design preview, content model and code for all four CMS platforms |
| Map components | source CMS, target CMS, components, requirement | field mapping, source code and mapped target code |
| Audit experience | URL or component, checks to run | scores, Core Web Vitals, findings with fixes |
| Migrate content | site URL, target CMS | inventory, component mapping, converted example page, review list |
| Prepare personalization blocks | component, audiences, goal, system | variants, audience rules, import metadata |

## Folder map

```
index.html                    page shell, loads the CSS and src/main.js
package.json                  npm start / npm test
README.md                     this file
.env.example                  copy to .env and add GEMINI_API_KEY

server/
  server.js                   app server: serves the page, answers /api/generate
  gemini.js                   the only file that talks to Gemini
  env.js                      reads .env

scripts/
  smoke-test.js               renders every workflow and checks the HTML
  ai-test.js                  tests the AI path against a mock Gemini
  mock-gemini.js              fake Gemini for tests (npm run mock)
  sample-inputs.js            default form values used by the tests
  serve.js                    plain static server, demo mode only (npm run start:static)

src/
  main.js                     entry: screen switching and the generate cycle
  config.js                   CMS list, USE_OPENAI flag, demo delay

  styles/                     tokens, base, components, home, workflow, results
  lib/                        dom, text and icon helpers
  ui/                         tabs, code blocks, tables, pills, forms, events
  views/                      home dashboard and the workflow screen frame
  services/generate.js        where results come from: AI path or demo path

  data/
    fields.js                 the sample component's fields in each CMS
    implementations/          sample code per CMS (aem, eds, contentful, optimizely)

  workflows/                  one folder per workflow
    index.js                  registry and card order
    create/ map/ audit/ migrate/ personalize/
      index.js                definition: texts, form, validation
      demo.js                 hardcoded result
      render.js               result to HTML
      sample-data.js          the numbers and text used by demo.js (some workflows)

  ai/
    system-prompt.js          instructions sent with every request
    prompts.js                one prompt per workflow (built on the server)
    validate.js               cleans the model's JSON into the screen's shape
    ai-client.js              browser side: asks the server for a result
```

## How a workflow works

```
form input -> check() -> generate() --+-- demo mode: workflow.demo(input) ----------+
                                      |                                             +-> data -> render.js -> HTML
                                      +-- AI mode:  POST /api/generate               |
                                            server builds the prompt                 |
                                            Gemini answers with JSON                 |
                                            validate.js cleans it ------------------+
```

`demo.js` returns a plain object, and its shape is written in the comment at the top of each `demo.js`. The AI prompts ask for the same shape, and `src/ai/validate.js` forces the model's answer into it. That is why `render.js` does not care where the data came from.

What the server does with each request:

1. Checks the input (types, lengths, known workflow) and the rate limit.
2. Builds the prompt from the form values (`src/ai/prompts.js`).
3. Calls Gemini once. If the answer is not valid JSON or fails validation, it calls once more.
4. Cleans the answer (`src/ai/validate.js`): fixes unknown labels, clamps scores, recalculates counts, drops things you did not ask for, and rejects answers missing required parts.
5. Sends the result to the browser, which draws it with the same `render.js` as demo mode. All model text is escaped when drawn.

## Common changes

**Change what the AI is told.** Edit `src/ai/system-prompt.js` (applies to every workflow) or the workflow's prompt in `src/ai/prompts.js`. Add your design tokens, coding standards and example components there to get output that matches your standards.

**Change the sample numbers or text.** Edit the workflow's `demo.js` or `sample-data.js`. For example, the audit scores and findings are in `src/workflows/audit/sample-data.js`.

**Change a color.** Edit `src/styles/tokens.css`. Light and dark values are both there.

**Change the sample code a CMS produces.** Edit the file for that CMS in `src/data/implementations/`. Placeholders such as `{{P}}` (PascalCase name) and `{{K}}` (kebab-case name) are filled in from the component name.

**Add a workflow.**
1. Copy a folder in `src/workflows/` and rename it.
2. Register it in `src/workflows/index.js` and add its id to `ORDER`.
3. Add an icon name in `src/lib/icons.js` if you need a new one.
4. Add a prompt for it in `src/ai/prompts.js` and a cleaner for it in `src/ai/validate.js`.

**Add a CMS.**
1. Add it to `CMS` and `CMS_IDS` in `src/config.js`.
2. Add a column for it in `src/data/fields.js`.
3. Add a file in `src/data/implementations/` and register it in that folder's `index.js`.

## Before using AI output for real work

- Review generated code before it goes near a client CMS.
- The server has a simple per-visitor limit (`RATE_LIMIT_MAX`, default 30 per 10 minutes) but no login. Do not put it on the public internet with a real key. Add sign-in first.
- Check with your manager or client whether their code and content may be sent to an external AI service.
- To use a different provider later, replace the body of `callGemini` in `server/gemini.js`. Nothing else needs to change.
