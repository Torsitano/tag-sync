import { EC2Client, Tag } from '@aws-sdk/client-ec2'
import { applyTagsToResources } from './tagUtils'
import * as fs from 'fs'
import { DRY_RUN_INSTANCES } from './main'

export async function restoreInstanceTagsFromBackup( ec2Client: EC2Client, backupFileName: string ) {

    if ( !fs.existsSync( backupFileName ) ) {
        console.error( `Backup file ${backupFileName} does not exist` )
        return
    }
    const backupFileContent = fs.readFileSync( backupFileName, 'utf-8' )
    const instanceTagsBackup: Record<string, Record<string, string>> = JSON.parse( backupFileContent )

    for ( const instanceId in instanceTagsBackup ) {
        const tagsObj = instanceTagsBackup[ instanceId ]
        const tags: Tag[] = Object.entries( tagsObj ).map( ( [ key, value ] ) => ( { Key: key, Value: value } ) )

        console.log( `Restoring tags for instance '${instanceId}'` )
        console.dir( tags )

        await applyTagsToResources( {
            ec2Client,
            resourceIds: [ instanceId ],
            tags: tags,
            isDryRun: DRY_RUN_INSTANCES,
            resourceType: 'instance',
            resourceName: instanceId
        } )
    }
}
