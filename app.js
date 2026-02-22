class BadRNG {
	constructor(seed) {
		this.seed = seed;
	}
	random() {
		/* inspired by https://stackoverflow.com/a/19303725 */
		const x = Math.sin(this.seed) * 10000;
		this.seed += x;
		return x - Math.floor(x);
	}
}

class WebGuessr {
	constructor(game_data_overrides) {
		this.game = {
			game_id: null,
			num_rounds: null,  // number of game rounds
			rounds: {},  // data for each game round
			score: null,
			cur_round: null,
		};
		Object.assign(this.game, game_data_overrides);
	}

	static async create(game_id, num_rounds, root_el, sites_list, counts_list) {
		if (num_rounds < 1)
			throw new Error("`num_rounds` must be ≥ 1.");

		const wg = new WebGuessr({
			game_id,
			num_rounds,
		});
		wg.rng = new BadRNG(game_id);
		wg.sites_list = sites_list;
		wg.counts_list = counts_list;
		wg.ui = {
			root: root_el,
		};
		wg.ui.round = await Round.create();
		wg.ui.round.inputControls.hidden = false;
		wg.ui.root.appendChild(wg.ui.round.round_el);
		wg.ui.round.init();
		wg.ui.round.submit.addEventListener("click", wg.submitRound.bind(wg));
		wg.ui.round.next.addEventListener("click", wg.next.bind(wg));

		return wg;
	}

	static async fromSaved(query_string) {
		const saved_game = WebGuessr.gameStateQueryDeserialize(query_string);  // saved game state
		console.log(saved_game);
		const wg = new WebGuessr(saved_game);
		wg.ui = {
			rounds: {}
		};
		for (const round_num in Object.keys(wg.game.rounds)) {
			const round_ui = await Round.create();
			wg.ui.rounds[round_num] = round_ui;
		}
		return wg;
	}

	static #calcRoundScore(correct_date, guessed_date) {
		/* TODO: Make this more forgiving/accurate (sub-year resolution) once we
		 * have feedback for the actual fetched archive date. */
		const correct_year = correct_date.getFullYear();
		const guessed_year = guessed_date.getFullYear();
		console.debug(`calcRoundScore(): correct=${correct_year} guessed=${guessed_year}`);
		const distance_years = Math.abs(correct_year - guessed_year);
		return Math.floor(5000 * Math.E**(-Math.log(2) * distance_years / 2));
	}

	static dateFmtWaybackMachine(date) {
		return `${date.getFullYear()}${date.getMonth()}${date.getDate()}`;
	}

	#frameLoadingHide() {
		this.ui.frame_loading_overlay.classList.add("hidden");
	}

	#frameLoadingShow() {
		this.ui.frame_loading_overlay.classList.remove("hidden");
	}

	static gameStateQuerySerialize(state) {
		const params = new URLSearchParams();
		params.set("g", JSON.stringify(state));
		return "?" + params.toString();
	}

	static gameStateQueryDeserialize(queryString) {
		const params = new URLSearchParams(queryString);
		return JSON.parse(params.get("g"));
	}

	/*
	async #getClosestArchivedURL(url, time) {
		const archive_request_url = `https://archive.org/wayback/available?url=http://${url}&timestamp=${time}`;
		console.log(archive_request_url);
		return fetch(archive_request_url)
			.then(rsp => rsp.json())
			.catch(console.error);
	}
	*/

	#randomKey(obj) {
		const keys = Object.keys(obj);
		return keys[Math.floor(this.rng.random() * keys.length)];
	}

	#randomElement(arr) {
		return arr[Math.floor(this.rng.random() * arr.length)];
	}

	runRound() {
		/* switch UI to input mode */
		this.ui.round.resultsControls.hidden = true;
		this.ui.round.inputControls.hidden = false;

		const r = this.game.rounds[this.game.cur_round] = {};
		const year = this.#randomKey(this.counts_list);
		let site = this.sites_list[this.#randomElement(this.counts_list[year])];
		console.debug("runRound():", year, site);
		const request_date = new Date(year, 7-1, 2);  // middle of year
		r.timestamp = request_date;
		r.url = site;
		r.archived_url = `https://web.archive.org/web/${WebGuessr.dateFmtWaybackMachine(request_date)}/${site}`;
		wg.ui.round.load(request_date.getFullYear(), r.archived_url);

		/*
		this.#getClosestArchivedURL(domain, `${request_year}0702`)  // middle of year
			.then(rsp => {
				const c = rsp.archived_snapshots?.closest;
				if (c === undefined)
					throw new Error("No closest archived snapshot result.");
				const closest_url = new URL(c.url);
				closest_url.protocol = "https:";
				r.timestamp = new Date(c.timestamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3 $4:$5:$6"));
				r.url = closest_url.toString();
				this.#loadFrame(r.url);
			});
		*/
	}

	start() {
		this.game.cur_round = 1;
		this.game.score = 0;
		this.runRound();
	}

	next() {
		if (this.game.cur_round >= this.game.num_rounds) {
			window.location = "/results.html" + WebGuessr.gameStateQuerySerialize(this.game);
		} else {
			this.game.cur_round++;
			this.runRound();
		}
	}

	submitRound() {
		const round = this.game.rounds[this.game.cur_round];
		const correct_date = round.timestamp;
		const guessed_date = new Date(parseInt(this.ui.round.sliderGuess.value), 0, 1);
		round.points = WebGuessr.#calcRoundScore(correct_date, guessed_date);
		this.game.score += round.points;
		console.log(`Round ${this.game.cur_round}: Awarded ${round.points} points. Game score is now ${this.game.score}.`);

		/* switch UI to results mode */
		this.ui.round.points.value = round.points;
		this.ui.round.total.value = this.game.score;
		this.ui.round.resultsControls.hidden = false;
		this.ui.round.inputControls.hidden = true;
	}
}
