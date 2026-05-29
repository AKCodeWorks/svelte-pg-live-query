<script>
	import { createRandomUser } from '$lib/internal/create-random-user.remote.js';
	import { testPgListener } from '../pg-live-test.remote.js';

	const user = $derived(await testPgListener());
</script>

<h2>{user?.name ?? 'Unknown'}</h2>
<p>{user?.id}</p>
<button onclick={async () => await createRandomUser()}>Create Random User</button>
