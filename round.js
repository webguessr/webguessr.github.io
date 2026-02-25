class Round {
    constructor(round_el) {
        // input controls
        this.inputControls = round_el.querySelector('.input.controlcontainer');
        this.sliderGuess = round_el.querySelector('.input .sliderGuess');
        this.textGuess = round_el.querySelector('.input .textGuess');

        // results controls
        this.resultsControls = round_el.querySelector('.results.controlcontainer');
        this.resultsSliderGuess = round_el.querySelector('.results .sliderGuess');
        this.resultsSliderCorrect = round_el.querySelector('.results .sliderCorrect');
        this.resultsTextGuess = round_el.querySelector('.results .textGuess');
        this.resultsTextCorrect = round_el.querySelector('.results .textCorrect');

        // iframe and overlay
        this.iframe = round_el.querySelector('iframe')
        this.overlay = round_el.querySelector('.overlay')

        // points text fields
        this.points = round_el.querySelector('.results .points')
        this.total = round_el.querySelector('.results .total')

        this.offset = round_el.querySelector('#offset')

        // buttons
        this.submit = round_el.querySelector('#submit')
        this.next = round_el.querySelector('#next')

        this.round_el = round_el
    }

    init() {

        this.textGuess.value = this.sliderGuess.value
        // wire up sliders to textboxes and set default
        this.sliderGuess.oninput = () => {
            this.textGuess.value = this.sliderGuess.value
            this.resultsSliderGuess.value = this.sliderGuess.value
            this.resultsTextGuess.value = this.sliderGuess.value
        };
        this.textGuess.oninput = () => {
            this.sliderGuess.value = this.textGuess.value;
            this.resultsSliderGuess.value = this.textGuess.value
            this.resultsTextGuess.value = this.textGuess.value
        };

        this.submit.onclick = () => {
            this.offset.textContent = Math.abs(this.sliderGuess.value - this.resultsSliderCorrect.value)
        }

        // hide overlay on load
        this.iframe.addEventListener("load", () => {this.overlay.hidden=true});
    }

    static async create() {
        let templates = await this.getTemplates();
        const round_template = templates.getElementById('round');
        let round_el = round_template.content.cloneNode(true).firstElementChild
        return new Round(round_el)
    }

    // fetch round template HTML
    static async getTemplates() {
        const templates = await fetch('templates.html')
            .then(r => r.text())
            .then(html => new DOMParser().parseFromString(html, 'text/html'))
        return templates
    }

    load(correctYear, url) {
        //document.getElementById("control").textContent = url;
        console.debug(`Loading frame ${url}`);
        this.overlay.hidden = false
        this.iframe.src = url;
        this.resultsSliderCorrect.value = correctYear;
        // fixme duplicate of onclick below - clean up logic
        this.offset.textContent = Math.abs(this.sliderGuess.value - this.resultsSliderCorrect.value)
    }
}
