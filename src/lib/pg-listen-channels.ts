type PgListenChannel = (typeof PG_LISTEN_CHANNELS)[keyof typeof PG_LISTEN_CHANNELS];

const PG_LISTEN_CHANNELS = {
	QAH_EVENTS: 'qah_event_changes'
} as const;

type PgListenPayloadByChannel = {
	[PG_LISTEN_CHANNELS.QAH_EVENTS]: {
		id: string;
		eventNumber: number;
		operation: 'INSERT' | 'UPDATE' | 'DELETE';
	};
};

type PgListenPayload<Channel extends PgListenChannel> = PgListenPayloadByChannel[Channel];

export { PG_LISTEN_CHANNELS };
export type { PgListenChannel, PgListenPayload };
