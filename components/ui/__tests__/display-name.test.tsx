import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DisplayName } from '../display-name';
const mockProfile = {getMyProfile:jest.fn(), updateMyProfile:jest.fn()};
jest.mock('@/lib/backend/context', () => ({useOntoBackend:()=>({profileBackend:mockProfile,auth:{state:{kind:'signed-in',user:{id:'account-a'}}}})}));
it('a late profile response never replaces a chosen name being edited', async () => {
 let resolve!: (value:any)=>void; const pending = new Promise(value=>{resolve=value}); mockProfile.getMyProfile.mockReturnValue(pending);
 render(<DisplayName />); fireEvent.changeText(screen.getByLabelText('Name or alias'),'Chosen alias');
 await act(async()=>{resolve({displayName:'Old account default'});await pending;});
 expect(screen.getByDisplayValue('Chosen alias')).toBeTruthy(); expect(screen.queryByDisplayValue('Old account default')).toBeNull();
});
