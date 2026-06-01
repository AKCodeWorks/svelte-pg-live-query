<script lang="ts">
	import { consumePgLive } from '$lib/consume-pg-live.js';
	import { createRandomUser } from '$lib/internal/create-random-user.remote.js';
	import { testPgListener } from '../pg-live-test.remote.js';

	const q = testPgListener();
	const live = $derived(await consumePgLive(q));
</script>

<h2>Newest User ID: {live.value?.id}</h2>
<p>Connected: {live.connected ? 'yes' : 'no'}</p>

<button onclick={async () => createRandomUser()}>create user</button>
