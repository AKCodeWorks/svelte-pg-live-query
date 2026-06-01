import type { RemoteLiveQuery } from '@sveltejs/kit';
import type { PgLiveQueryValue } from './pg-live-query';

type LiveData<TLiveQuery> =
	TLiveQuery extends RemoteLiveQuery<PgLiveQueryValue<infer TData>> ? TData : never;
type ConsumeWithCache = typeof consumePgLive & {
	__cache?: WeakMap<object, unknown>;
};

export async function consumePgLive<TLiveQuery extends RemoteLiveQuery<PgLiveQueryValue<unknown>>>(
	query: TLiveQuery
) {
	type TData = LiveData<TLiveQuery>;
	const fn = consumePgLive as ConsumeWithCache;
	const cache = (fn.__cache ??= new WeakMap<object, unknown>());
	const key = query as unknown as object;
	const current = await query;
	let value = cache.get(key) as TData | undefined;

	if (
		current &&
		(current.type === 'init' || current.type === 'update') &&
		current.data !== null &&
		current.data !== undefined
	) {
		value = current.data as TData;
		cache.set(key, value);
	}

	const error =
		current?.type === 'error'
			? current.data.message
			: query.error instanceof Error
				? query.error.message
				: undefined;

	return {
		value,
		connected: query.connected,
		error
	};
}
