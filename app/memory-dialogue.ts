export type DialogueLanguage = 'zh' | 'en';
export type DialogueZone = 1 | 2;

export interface DialogueLine {
  id: string;
  speaker: string;
  replyTo?: string;
  text: string;
}

// These are scripted characters, not visitors or messages fetched from a server.
// The caller supplies this run's second answer and labels the conversation as fiction.
const COPY = {
  zh: {
    speakers: ['小林', '阿禾'],
    first: [
      '我好像记得有五个人，后面还站着一个。',
      '听你这么一说，我也觉得是五个。',
    ],
    responses: {
      3: ['刚才那个人选了三个。', '三个？那我刚才说五个，也没那么确定了。'],
      4: ['刚才那个人选了四个，和我们说的不一样。', '那我们说的第五个人，到底在哪儿？'],
      5: ['刚才那个人也选了五个。', '那我就更确定了，是五个。'],
      0: ['刚才那个人选的是“记不清了”。', '这可不能算是在同意我们。'],
      unanswered: ['还没有那个人的回答。', '先别把人家算进来。'],
    },
    summaries: {
      3: '你第二次选了三人。阿禾开始怀疑先前的五人说法。',
      4: '你第二次选了四人。他们开始追问第五个人在哪里。',
      5: '你第二次也选了五人。阿禾把你的回答当作支持，语气更肯定了。',
      0: '你第二次选了“记不清了”。这没有被算作对五人的认同。',
      unanswered: '还没有第二次回答。他们没有引用你的选择。',
    },
  },
  en: {
    speakers: ['Lin', 'Rowan'],
    first: [
      'Was it five? I think someone was standing behind the others.',
      'Now that you mention it, five sounds right.',
    ],
    responses: {
      3: ['The person who just passed picked three.', 'Three? I am less sure about the five I remembered.'],
      4: ['The person who just passed picked four, not five.', 'Then where was that fifth person we were talking about?'],
      5: ['The person who just passed picked five too.', 'That settles it for me. Five.'],
      0: ['The person who just passed chose “Not sure”.', 'That is not another vote for five.'],
      unanswered: ['There is no answer from that person yet.', 'Then we cannot count them as agreeing.'],
    },
    summaries: {
      3: 'Your second answer was three. Rowan began to question five.',
      4: 'Your second answer was four. They questioned where the fifth person was.',
      5: 'Your second answer was five. Rowan took it as support and sounded more certain.',
      0: 'You chose “Not sure” the second time. It was not counted as agreement.',
      unanswered: 'There is no second answer yet. They do not quote a choice from you.',
    },
  },
} as const;

function answerBranch(answer: number | undefined): 3 | 4 | 5 | 0 | 'unanswered' {
  return answer === 3 || answer === 4 || answer === 5 || answer === 0 ? answer : 'unanswered';
}

export function dialogueLines(zone: DialogueZone, answer: number | undefined, language: DialogueLanguage): DialogueLine[] {
  const copy = COPY[language];
  const branch = answerBranch(answer);
  const text = zone === 1 ? copy.first : copy.responses[branch];
  const firstId = zone === 1 ? 'first-lin' : `reply-${branch}-lin`;
  return [
    { id: firstId, speaker: copy.speakers[0], text: text[0] },
    { id: zone === 1 ? 'first-rowan' : `reply-${branch}-rowan`, speaker: copy.speakers[1], replyTo: firstId, text: text[1] },
  ];
}

export function dialogueSummary(answer: number | undefined, language: DialogueLanguage): string {
  return COPY[language].summaries[answerBranch(answer)];
}
