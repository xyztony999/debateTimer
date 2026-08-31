import React from 'react';
import { useParams } from 'react-router-dom';
import DebateTimer from './DebateTimer';

export default function DisplayTimer() {
    const { token } = useParams();
    return <DebateTimer shareToken={token} />;
}
