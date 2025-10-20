// export const fetchFeedCarousel = async () => {
//   const { data, error } = await supabase.from("feed_carousel").select("*");

//   if (error) throw new Error("Failed to fetch feed carousel: " + error.message);

//   return data;
// };



import { createClient } from './server';

export const fetchFeedCarousel = async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('feed_carousel')
    .select('*');

  if (error)
    throw new Error(
      'Failed to fetch feed carousel: ' + error.message
    );

  return data;
};
