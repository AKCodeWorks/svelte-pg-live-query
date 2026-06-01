<script lang="ts">
	import { createRandomUser } from '$lib/internal/create-random-user.remote.js';
	import { testPgListener } from '../pg-live-test.remote.js';
	const q = $derived(await testPgListener());
</script>

<h2>Newest User ID: {q.data?.id}</h2>

<button onclick={async () => createRandomUser()}>create user</button>
