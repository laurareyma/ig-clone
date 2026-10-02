import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '@/presentation/screens/chat-screen';

export default function ChatRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  return <ChatScreen conversationId={conversationId} />;
}
