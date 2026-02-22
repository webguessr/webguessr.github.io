class BadRNG {
	constructor(seed) {
		this.seed = seed;
	}
	random() {
		/* lifted from https://stackoverflow.com/a/19303725 */
		const x = Math.sin(this.seed++) * 10000;
		return x - Math.floor(x);
	}
}

class WebGuessr {
	constructor(game_id, num_rounds, frame, domains, submit_button, sites_list, counts_list) {
		this.rng = new BadRNG(game_id);  // random number generator
		this.num_rounds = num_rounds;  // number of game rounds
		this.frame = frame;  // iframe element
		this.domains = domains;  // list of domains
		this.rounds = {};  // data for each game round
		this.submit_button = submit_button;  // submit button
		this.sites_list = sites_list;
		this.counts_list = counts_list;

		if (!(this.frame instanceof HTMLIFrameElement))
			throw new Error("`frame` must be an <iframe> element.");
		if (this.num_rounds < 1)
			throw new Error("`num_rounds` must be ≥ 1.");

		this.submit_button.addEventListener("click", this.submitRound.bind(this));

		this.cur_round = 1;
		this.runRound();
	}

	#loadFrame(url) {
		//document.getElementById("control").textContent = url;
		console.debug(`Loading frame ${url}`);
		this.frame.src = url;
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

	#calcScore(correct_date, guessed_date) {
		console.debug("calcScore():", correct_date, guessed_date);
		const distance_years = Math.abs(correct_date - guessed_date) / 8.64e7 / 365.25;
		return Math.floor(5000 * Math.E**(-Math.log(2) * distance_years / 2));
	}

	#randomKey(obj) {
		const keys = Object.keys(obj);
		return keys[Math.floor(this.rng.random() * keys.length)];
	}

	runRound() {
		console.debug("runRound()");
		const r = this.rounds[this.cur_round] = {};
		const year = this.#randomKey(this.counts_list);
		let site = this.sites_list[Math.floor(this.rng.random() * this.sites_list.length)];
		this.#loadFrame(`https://web.archive.org/web/${year}0702/${site}`);
		/*
		this.#getClosestArchivedURL(domain, `${request_year}0702`)
			.then(rsp => {
				if (!("closest" in rsp.archived_snapshots))
					throw new Error("No closest archived snapshot result.");
				const c = rsp.archived_snapshots.closest;
				const closest_url = new URL(c.url);
				closest_url.protocol = "https:";
				r.timestamp = new Date(c.timestamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3 $4:$5:$6"));
				r.url = closest_url.toString();
				this.#loadFrame(r.url);
			});
		*/
	}

	submitRound() {
		const guessed_date = new Date(document.getElementById("selectedYear").value + "-01-01");
		const points = this.#calcScore(this.rounds[this.cur_round].timestamp, guessed_date);
		console.log(`Awarded ${points} points.`);
		this.cur_round++;
		this.runRound();
		if (this.cur_round < this.num_rounds) {
		} else {
			this.#submitGame();
		}
	}

	#submitGame() {
		// TODO: window.location = ???;
	}
}
