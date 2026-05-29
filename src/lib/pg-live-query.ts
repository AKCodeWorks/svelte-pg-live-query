import {
	createPostgresListener,
	defaultPostgresListener,
	type CreatePostgresListenerOptions
} from './postgres-listener';
import { getRequestEvent } from '$app/server';

type MaybePromise<T> = T | Promise<T>;

type LivePostgresQueryContext<Input> = {
	input: Input;
};

type LivePostgresNotificationContext<Payload, Input> = {
	input: Input;
	payload: Payload;
};

const SKIP = Symbol('skip client update');
let activeLiveQueryConnections = 0;

type PgLiveQueryFactoryOptions = {
	debug?: boolean;
	debounceMs?: number;
	postgres?: CreatePostgresListenerOptions;
};

type LivePostgresQueryOptions<Channel extends string, Payload, Result, Input = void> = {
	channel: Channel;
	debug?: boolean;
	id?: string;
	onInit: (context: LivePostgresQueryContext<Input>) => MaybePromise<Result>;
	onNotified: (
		context: LivePostgresNotificationContext<Payload, Input>
	) => MaybePromise<Result | typeof SKIP>;
	onServer?: (context: LivePostgresNotificationContext<Payload, Input>) => void;
};

const createPgLiveQuery = <Channels extends Record<string, unknown>>(
	factoryOptions: PgLiveQueryFactoryOptions = {}
) => {
	const listener = factoryOptions.postgres
		? createPostgresListener(factoryOptions.postgres)
		: defaultPostgresListener;
	const defaultDebug = factoryOptions.debug ?? false;
	const debounceMs = factoryOptions.debounceMs ?? 100;

	const fn = <Channel extends keyof Channels & string, Result, Input = void>({
		channel,
		debug = defaultDebug,
		id = '',
		onInit,
		onNotified,
		onServer
	}: LivePostgresQueryOptions<Channel, Channels[Channel], Result, Input>) => {
		return async function* (input: Input) {
			const logConnection = (event: 'subscribed' | 'unsubscribed', liveQueryConnections: number) => {
				if (!debug) return;
				console.log('[pgLiveQuery]', {
					event,
					channel,
					id,
					subscribers: liveQueryConnections,
					postgresConnections: listener.getActivePostgresConnectionCount()
				});
			};

			activeLiveQueryConnections += 1;

			const queue: Channels[Channel][] = [];
			let wake: (() => void) | undefined;

			const onPostgresNotification = (payload: Channels[Channel]) => {
				onServer?.({ input, payload });
				queue.push(payload);
				wake?.();
				wake = undefined;
			};

			const unsubscribe = await listener.listenToPostgresChannel(channel, onPostgresNotification);
			logConnection('subscribed', activeLiveQueryConnections);

			try {
				const { request } = getRequestEvent();
				yield await onInit({ input });

				while (!request.signal.aborted) {
					if (queue.length === 0) {
						await new Promise<void>((resolve) => {
							const onAbort = () => {
								request.signal.removeEventListener('abort', onAbort);
								wake = undefined;
								resolve();
							};

							wake = () => {
								request.signal.removeEventListener('abort', onAbort);
								wake = undefined;
								resolve();
							};

							request.signal.addEventListener('abort', onAbort, { once: true });
						});
					}

					while (queue.length > 0) {
						const payload = queue.shift();
						if (!payload) continue;

						const nextValue = await onNotified({ input, payload });
						if (nextValue === SKIP) continue;

						yield nextValue;
						if (debounceMs > 0) {
							await new Promise((resolve) => setTimeout(resolve, debounceMs));
						}
					}
				}
			} finally {
				await unsubscribe();
				activeLiveQueryConnections = Math.max(0, activeLiveQueryConnections - 1);
				logConnection('unsubscribed', activeLiveQueryConnections);
			}
		};
	};

	return { fn };
};

export { createPgLiveQuery, SKIP };
