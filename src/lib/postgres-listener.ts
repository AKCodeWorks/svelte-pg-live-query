import { env } from '$env/dynamic/private';
import createSubscriber from 'pg-listen';

type SubscriberConfig = Parameters<typeof createSubscriber>[0];
type SubscriberInstance = ReturnType<typeof createSubscriber>;

type CreatePostgresListenerOptions = {
	connectionString?: string;
	subscriberConfig?: Omit<SubscriberConfig, 'connectionString'>;
	onError?: (error: Error) => void;
};

const createPostgresListener = (options: CreatePostgresListenerOptions = {}) => {
	let subscriber: SubscriberInstance | null = null;
	let subscriberPromise: Promise<SubscriberInstance> | null = null;
	const listeningChannels = new Set<string>();
	const channelSubscriberCounts = new Map<string, number>();
	let activePostgresConnections = 0;
	const handleError =
		options.onError ?? ((error: Error) => console.error('Postgres notification listener failed:', error));

	const getPostgresSubscriber = async (): Promise<SubscriberInstance> => {
		if (subscriber) return subscriber;

		subscriberPromise ??= (async () => {
			const connectionString = options.connectionString ?? env.DATABASE_URL;
			if (!connectionString) {
				throw new Error('DATABASE_URL is required to listen for Postgres notifications');
			}

			const nextSubscriber = createSubscriber({
				connectionString,
				...(env.NODE_ENV === 'production' && { ssl: { rejectUnauthorized: false } }),
				...options.subscriberConfig
			});

			nextSubscriber.events.on('error', handleError);

			await nextSubscriber.connect();
			activePostgresConnections = 1;

			subscriber = nextSubscriber;
			return nextSubscriber;
		})();

		if (!subscriberPromise) {
			throw new Error('Failed to initialize Postgres subscriber');
		}

		return await subscriberPromise;
	};

	const getActivePostgresConnectionCount = () => activePostgresConnections;

	const listenToPostgresChannel = async <Payload>(
		channel: string,
		callback: (payload: Payload) => void
	) => {
		const postgresSubscriber = await getPostgresSubscriber();

		if (!listeningChannels.has(channel)) {
			await postgresSubscriber.listenTo(channel);
			listeningChannels.add(channel);
		}

		const listener = (payload: Payload) => callback(payload);
		postgresSubscriber.notifications.on(channel, listener);

		channelSubscriberCounts.set(channel, (channelSubscriberCounts.get(channel) ?? 0) + 1);

		return async () => {
			postgresSubscriber.notifications.removeListener(channel, listener);

			const nextCount = Math.max(0, (channelSubscriberCounts.get(channel) ?? 0) - 1);
			channelSubscriberCounts.set(channel, nextCount);

			if (nextCount === 0 && listeningChannels.has(channel)) {
				await postgresSubscriber.unlisten(channel);
				listeningChannels.delete(channel);
			}
		};
	};

	return {
		listenToPostgresChannel,
		getActivePostgresConnectionCount
	};
};

const defaultPostgresListener = createPostgresListener();

export { createPostgresListener, defaultPostgresListener };
export type { CreatePostgresListenerOptions };
