insert into metamarket.markets (id, status, state)
values (
  '72616d6179616e6132303236',
  'active',
  jsonb_build_object(
    'title', 'Will Ramayana cross ₹2,000 crore worldwide?',
    'description', 'Resolves Yes if Sacnilk reports more than ₹2,000 crore in worldwide theatrical gross for Ramayana: Part One during its original theatrical run. Resolves No if Sacnilk’s final total for that run is ₹2,000 crore or less. Worldwide gross includes India gross and overseas gross across all languages.',
    'category', 'Entertainment',
    'marketType', 'binary',
    'ammType', 'lmsr',
    'logoUrl', '/ramayana/poster.jpg',
    'options', '[{"id":"yes","name":"Yes","shares":10000},{"id":"no","name":"No","shares":10000}]'::jsonb,
    'yesPool', 1000,
    'noPool', 1000,
    'volume', 0,
    'initialB', 1000,
    'minB', 250,
    'isDynamic', false,
    'priceHistory', jsonb_build_array(jsonb_build_object(
      'yesPrice', 50,
      'noPrice', 50,
      'prices', '[{"optionId":"yes","price":50},{"optionId":"no","price":50}]'::jsonb,
      'note', 'Market opened',
      'timestamp', now()
    ))
  )
)
on conflict (id) do nothing;
