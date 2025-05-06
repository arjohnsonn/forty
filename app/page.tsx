import Conversation from "@/components/Conversation";
import NewConvo from "@/components/NewConvo";

export default function Home() {
  return (
    <div>
      {/* Uncomment if needed: <NewConvo /> */}
      <Conversation title="New chat" messages={[]} />
    </div>
  );
}
