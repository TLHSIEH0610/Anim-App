export type AppStackParamList = {
  Login: undefined;
  AllBooks: undefined;
  BookLibrary: undefined; // Purchased books
  Account: undefined;
  TemplateDemo: { template: import('../api/books').StoryTemplateSummary };
  BookCreation: { templateSlug?: string } | undefined;
  BookStatus: { bookId: number };
  BookViewer: { bookId: number };
  BillingHistory: undefined;
  Support: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  DeleteAccount: undefined;
  DeleteReceipt: { manifest: any } | undefined;
};
