export type AppStackParamList = {
  Login: undefined;
  AllBooks: undefined;
  BookLibrary: undefined; // Purchased books
  Account: undefined;
  BookCreation: { templateSlug?: string } | undefined;
  BookStatus: { bookId: number };
  BookViewer: { bookId: number };
  BillingHistory: undefined;
};
