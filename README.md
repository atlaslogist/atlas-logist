# Atlas Logist — presentation prototype

Stage 1: static Settings and Decision Fork screens. A single presentation scenario: 60,000 orders, branch B 3,260 trips, 497 RUB per point, baseline 780 RUB, savings 16.98m RUB (17.0m rounded).

No carrier APIs, route solver or real dispatch are executed. The visible demonstration mode identifies the experience as a prototype. The dispatch button stays disabled until the next stage is implemented.

Colors: #F1F1F2, #1C1F20, #5C5C60, #5880A6, #406180, #B8CFE6, #EDF5FF.
Typography: locally hosted IBM Plex Sans Condensed, IBM Plex Sans and IBM Plex Mono.

Settings preserve target, channels, tonnage rates, delivery windows and response timeout in the current browser session. Three branches can be selected; target changes their target-status labels. Tonnage settings are UI inputs for later scenario stages, not a production calculator. Alternative branch and waterfall component figures are provisional presentation values; the supplied brief specified the branch B anchor but embedded slide images could not be retrieved for exact transcription.

Existing Excel import files and SheetJS remain available for stage 2 integration. Previous calculator source remains in app.js/style.css/engine.js but is no longer loaded by index.html.

Next: 30-second offline map analysis, then simulated dispatch, monitoring and dedicated mobile flows. Read the approved visual direction before proceeding.

GitHub Pages publishes main automatically. Keep stage.js/stage.css cache versions current in index.html.


## Анализ и мониторинг
Добавлен автономный SVG-анализ за 30 секунд с завершением по кнопке. Excel/CSV принимает существующий шаблон и показывает фактическое число строк; расчёт и карта демонстрируют фиксированный сценарий 60 000 заявок. Рассылка моделируется за 8 секунд; никаких API-вызовов перевозчикам нет. Мониторинг показывает демонстрационный срез дня, а экспорт CSV содержит все рейсы выбранной ветки, суммарно 60 000 заявок.
